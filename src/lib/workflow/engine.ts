import { supabase } from "@/integrations/supabase/client";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria } from "@/lib/auditLogger";
import { enqueueItemProvisioning } from "./provisioning";

/**
 * Motor de workflow de aprovação para solicitações de acesso.
 *
 * Visão geral:
 *  - Cada solicitação é associada a UM fluxo (workflow_fluxos) escolhido por escopo + filtros.
 *  - O fluxo tem N etapas em ordem (workflow_etapas).
 *  - Cada etapa tem um tipo de aprovador (gestor_direto | owner_recurso | usuario_especifico | papel).
 *  - Para cada etapa ativada, criamos N rows em workflow_execucoes (uma por aprovador resolvido)
 *    em status "pendente". Decisões individuais alimentam o modo (qualquer_um | todos).
 *  - Ao finalizar a última etapa com "aprovada", o motor:
 *      • marca todos os solicitacao_itens como aprovado,
 *      • enfileira o provisionamento em iam_queue,
 *      • dispara o processamento Entra/AD,
 *      • atualiza a solicitação para "aprovada".
 *  - Qualquer rejeição em modo qualquer_um, ou consenso de rejeição em modo todos, encerra
 *    a solicitação como "rejeitada".
 */

type Escopo = "solicitacao" | "excecao" | "jml";

export interface WorkflowContexto {
  solicitanteEmail?: string | null;
  itens: Array<{
    id: string;
    tipo: "app" | "grupo" | "licenca";
    recurso_id: string;
    recurso_nome: string;
    owner_email: string | null;
  }>;
  aplicacaoIds: string[];
  grupoIds: string[];
  licencaIds: string[];
  perfilId: string | null;
}

interface Fluxo {
  id: string;
  nome: string;
  escopo: Escopo;
  is_default: boolean;
  prioridade: number;
  filtro_aplicacao_ids: string[];
  filtro_perfil_ids: string[];
  filtro_licenca_ids: string[];
  ativo: boolean;
}

interface Etapa {
  id: string;
  fluxo_id: string;
  ordem: number;
  nome: string;
  tipo_aprovador: "gestor_direto" | "owner_recurso" | "usuario_especifico" | "papel";
  papel: string | null;
  modo_aprovacao: "qualquer_um" | "todos";
  timeout_horas: number;
  acao_timeout: string;
  ativo: boolean;
}

// ---------------------------------------------------------
// Seleção de fluxo
// ---------------------------------------------------------

export async function selectFluxo(escopo: Escopo, ctx: WorkflowContexto): Promise<Fluxo | null> {
  const { data: fluxos } = await supabase
    .from("workflow_fluxos")
    .select("*")
    .eq("escopo", escopo)
    .eq("ativo", true)
    .order("prioridade", { ascending: true });

  if (!fluxos || fluxos.length === 0) return null;

  const matches = (f: any) => {
    const fa = (f.filtro_aplicacao_ids || []) as string[];
    const fp = (f.filtro_perfil_ids || []) as string[];
    const fl = (f.filtro_licenca_ids || []) as string[];
    const hasAnyFilter = fa.length + fp.length + fl.length > 0;
    if (!hasAnyFilter) return false;
    if (fa.length > 0 && !ctx.aplicacaoIds.some((id) => fa.includes(id))) return false;
    if (fp.length > 0 && (!ctx.perfilId || !fp.includes(ctx.perfilId))) return false;
    if (fl.length > 0 && !ctx.licencaIds.some((id) => fl.includes(id))) return false;
    return true;
  };

  const matched = fluxos.find((f: any) => matches(f));
  if (matched) return matched as Fluxo;
  return (fluxos.find((f: any) => f.is_default) || fluxos[0]) as Fluxo;
}

// ---------------------------------------------------------
// Resolução de aprovadores
// ---------------------------------------------------------

async function resolveAprovadores(etapa: Etapa, ctx: WorkflowContexto, solicitanteId: string | null): Promise<string[]> {
  const emails = new Set<string>();

  if (etapa.tipo_aprovador === "owner_recurso") {
    ctx.itens.forEach((i) => { if (i.owner_email) emails.add(i.owner_email.toLowerCase()); });
  } else if (etapa.tipo_aprovador === "gestor_direto" && solicitanteId) {
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("gestor_id")
      .eq("id", solicitanteId)
      .maybeSingle();
    if (colab?.gestor_id) {
      const { data: gestor } = await supabase
        .from("colaboradores")
        .select("email")
        .eq("id", colab.gestor_id)
        .maybeSingle();
      if (gestor?.email) emails.add(gestor.email.toLowerCase());
    }
  } else if (etapa.tipo_aprovador === "papel" && etapa.papel) {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", etapa.papel as any);
    const ids = (roleRows || []).map((r: any) => r.user_id);
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("email")
        .in("id", ids);
      (profs || []).forEach((p: any) => { if (p.email) emails.add(p.email.toLowerCase()); });
    }
  } else if (etapa.tipo_aprovador === "usuario_especifico") {
    const { data: aprs } = await supabase
      .from("workflow_etapa_aprovadores")
      .select("email")
      .eq("etapa_id", etapa.id);
    (aprs || []).forEach((a: any) => { if (a.email) emails.add(a.email.toLowerCase()); });
  }

  // Anti self-approval: remove o solicitante da lista
  if (ctx.solicitanteEmail) emails.delete(ctx.solicitanteEmail.toLowerCase());

  return Array.from(emails);
}

// ---------------------------------------------------------
// Início e ativação de etapas
// ---------------------------------------------------------

export async function startWorkflow(
  escopo: Escopo,
  solicitacaoId: string,
  solicitanteId: string | null,
  ctx: WorkflowContexto,
  requestedBy: string,
): Promise<{ status: "em_aprovacao" | "aprovada" | "rejeitada"; fluxoId: string | null }> {
  const fluxo = await selectFluxo(escopo, ctx);
  if (!fluxo) {
    // Sem fluxo configurado → aprovação automática (compatibilidade)
    await finalizeApproval(solicitacaoId, ctx, requestedBy, "Sem fluxo de aprovação configurado");
    return { status: "aprovada", fluxoId: null };
  }

  const { data: etapas } = await supabase
    .from("workflow_etapas")
    .select("*")
    .eq("fluxo_id", fluxo.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  await supabase
    .from("solicitacoes_acesso")
    .update({ fluxo_id: fluxo.id, etapa_atual_ordem: 1, status: "em_aprovacao" } as any)
    .eq("id", solicitacaoId);

  if (!etapas || etapas.length === 0) {
    await finalizeApproval(solicitacaoId, ctx, requestedBy, `Fluxo "${fluxo.nome}" sem etapas — aprovação automática`);
    return { status: "aprovada", fluxoId: fluxo.id };
  }

  return await activateEtapa(solicitacaoId, etapas[0] as Etapa, ctx, solicitanteId, requestedBy);
}

async function activateEtapa(
  solicitacaoId: string,
  etapa: Etapa,
  ctx: WorkflowContexto,
  solicitanteId: string | null,
  requestedBy: string,
): Promise<{ status: "em_aprovacao" | "aprovada" | "rejeitada"; fluxoId: string | null }> {
  const aprovadores = await resolveAprovadores(etapa, ctx, solicitanteId);

  await supabase
    .from("solicitacoes_acesso")
    .update({ etapa_atual_ordem: etapa.ordem } as any)
    .eq("id", solicitacaoId);

  if (aprovadores.length === 0) {
    // Nenhum aprovador resolvido — aplica acao_timeout imediata
    if (etapa.acao_timeout === "auto_rejeitar") {
      await finalizeRejection(solicitacaoId, requestedBy, `Etapa "${etapa.nome}" sem aprovadores — rejeição automática`);
      return { status: "rejeitada", fluxoId: etapa.fluxo_id };
    }
    // escalar_proxima ou auto_aprovar → tenta próxima etapa
    return await advanceToNext(solicitacaoId, etapa, ctx, solicitanteId, requestedBy);
  }

  // Cria as rows pendentes
  const rows = aprovadores.map((email) => ({
    solicitacao_id: solicitacaoId,
    etapa_id: etapa.id,
    ordem: etapa.ordem,
    aprovador_email: email,
    aprovador: email,
    entidade_tipo: "solicitacao",
    entidade_id: solicitacaoId,
    status: "pendente",
  }));
  await supabase.from("workflow_execucoes").insert(rows as any);

  // Notifica aprovadores
  for (const email of aprovadores) {
    sendNotificationEmail("solicitacao_criada", {
      destinatario_email: email,
      colaborador_nome: ctx.solicitanteEmail || "—",
      itens: ctx.itens.map((i) => i.recurso_nome).join(", "),
      justificativa: `Etapa: ${etapa.nome}`,
      solicitante: requestedBy,
    });
  }

  return { status: "em_aprovacao", fluxoId: etapa.fluxo_id };
}

// ---------------------------------------------------------
// Decisão
// ---------------------------------------------------------

export async function recordDecision(
  solicitacaoId: string,
  aprovadorEmail: string,
  decisao: "aprovada" | "rejeitada",
  comentario: string | null,
  decididoPor: string,
): Promise<void> {
  // Busca solicitação + fluxo + etapa atual
  const { data: solic } = await supabase
    .from("solicitacoes_acesso")
    .select("*")
    .eq("id", solicitacaoId)
    .maybeSingle();
  if (!solic) throw new Error("Solicitação não encontrada");
  if (!solic.fluxo_id || !solic.etapa_atual_ordem) {
    throw new Error("Solicitação sem fluxo de aprovação ativo");
  }

  const { data: etapa } = await supabase
    .from("workflow_etapas")
    .select("*")
    .eq("fluxo_id", solic.fluxo_id)
    .eq("ordem", solic.etapa_atual_ordem)
    .maybeSingle();
  if (!etapa) throw new Error("Etapa atual não encontrada");

  // Atualiza a row pendente do aprovador
  const { error: updErr } = await supabase
    .from("workflow_execucoes")
    .update({
      status: decisao,
      comentario: comentario,
      data_decisao: new Date().toISOString(),
    } as any)
    .eq("solicitacao_id", solicitacaoId)
    .eq("etapa_id", etapa.id)
    .eq("aprovador_email", aprovadorEmail.toLowerCase())
    .eq("status", "pendente");
  if (updErr) throw updErr;

  // Avalia status da etapa
  const { data: execs } = await supabase
    .from("workflow_execucoes")
    .select("status")
    .eq("solicitacao_id", solicitacaoId)
    .eq("etapa_id", etapa.id);

  const total = (execs || []).length;
  const aprovadas = (execs || []).filter((e: any) => e.status === "aprovada").length;
  const rejeitadas = (execs || []).filter((e: any) => e.status === "rejeitada").length;
  const pendentes = total - aprovadas - rejeitadas;

  // Reconstroi contexto resumido a partir da solicitação
  const ctx = await rebuildContext(solic);

  // Regra de decisão
  if (etapa.modo_aprovacao === "qualquer_um") {
    if (rejeitadas > 0) {
      await finalizeRejection(solicitacaoId, decididoPor, comentario || "Rejeitada por aprovador");
      return;
    }
    if (aprovadas > 0) {
      await onEtapaApproved(solicitacaoId, etapa as Etapa, ctx, decididoPor);
      return;
    }
  } else {
    // modo todos
    if (rejeitadas > 0) {
      await finalizeRejection(solicitacaoId, decididoPor, comentario || "Rejeitada por aprovador");
      return;
    }
    if (pendentes === 0 && aprovadas === total) {
      await onEtapaApproved(solicitacaoId, etapa as Etapa, ctx, decididoPor);
      return;
    }
  }
}

async function rebuildContext(solic: any): Promise<WorkflowContexto> {
  const { data: itens } = await supabase
    .from("solicitacao_itens")
    .select("*")
    .eq("solicitacao_id", solic.id);
  const { data: solCol } = solic.solicitante_id
    ? await supabase.from("colaboradores").select("email").eq("id", solic.solicitante_id).maybeSingle()
    : { data: null };
  return {
    solicitanteEmail: solCol?.email || null,
    itens: (itens || []) as any,
    aplicacaoIds: solic.aplicacoes_ids || [],
    grupoIds: solic.grupos_ids || [],
    licencaIds: solic.licencas_ids || [],
    perfilId: solic.perfil_id || null,
  };
}

async function onEtapaApproved(
  solicitacaoId: string,
  etapa: Etapa,
  ctx: WorkflowContexto,
  decididoPor: string,
): Promise<void> {
  // Há próxima etapa?
  const { data: next } = await supabase
    .from("workflow_etapas")
    .select("*")
    .eq("fluxo_id", etapa.fluxo_id)
    .eq("ativo", true)
    .gt("ordem", etapa.ordem)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next) {
    // Busca solicitante p/ resolver gestor
    const { data: solic } = await supabase
      .from("solicitacoes_acesso")
      .select("solicitante_id")
      .eq("id", solicitacaoId)
      .maybeSingle();
    await activateEtapa(solicitacaoId, next as Etapa, ctx, solic?.solicitante_id || null, decididoPor);
    return;
  }

  // Última etapa → aprovação final
  await finalizeApproval(solicitacaoId, ctx, decididoPor, "Aprovado pelo fluxo de workflow");
}

async function advanceToNext(
  solicitacaoId: string,
  etapa: Etapa,
  ctx: WorkflowContexto,
  solicitanteId: string | null,
  requestedBy: string,
): Promise<{ status: "em_aprovacao" | "aprovada" | "rejeitada"; fluxoId: string | null }> {
  const { data: next } = await supabase
    .from("workflow_etapas")
    .select("*")
    .eq("fluxo_id", etapa.fluxo_id)
    .eq("ativo", true)
    .gt("ordem", etapa.ordem)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (next) return await activateEtapa(solicitacaoId, next as Etapa, ctx, solicitanteId, requestedBy);
  await finalizeApproval(solicitacaoId, ctx, requestedBy, "Fluxo concluído");
  return { status: "aprovada", fluxoId: etapa.fluxo_id };
}

// ---------------------------------------------------------
// Finalização
// ---------------------------------------------------------

async function finalizeApproval(
  solicitacaoId: string,
  ctx: WorkflowContexto,
  decididoPor: string,
  motivo: string,
): Promise<void> {
  // Marca itens como aprovados
  await supabase
    .from("solicitacao_itens")
    .update({
      status: "aprovado",
      decidido_por: decididoPor,
      decidido_em: new Date().toISOString(),
    } as any)
    .eq("solicitacao_id", solicitacaoId)
    .eq("status", "pendente");

  // Atualiza solicitação
  await supabase
    .from("solicitacoes_acesso")
    .update({
      status: "aprovada",
      aprovador: decididoPor,
      comentario: motivo,
      data_decisao: new Date().toISOString(),
    } as any)
    .eq("id", solicitacaoId);

  // Carrega solicitação para provisionamento
  const { data: solic } = await supabase
    .from("solicitacoes_acesso")
    .select("solicitante_id")
    .eq("id", solicitacaoId)
    .maybeSingle();
  if (!solic?.solicitante_id) return;

  const { data: colab } = await supabase
    .from("colaboradores")
    .select("id, email, entra_id, sam_account_name, nome")
    .eq("id", solic.solicitante_id)
    .maybeSingle();
  if (!colab) return;

  // Carrega mapas de recursos
  const appIds = ctx.itens.filter((i) => i.tipo === "app").map((i) => i.recurso_id);
  const grpIds = ctx.itens.filter((i) => i.tipo === "grupo").map((i) => i.recurso_id);
  const licIds = ctx.itens.filter((i) => i.tipo === "licenca").map((i) => i.recurso_id);

  const [{ data: apps }, { data: grps }, { data: lics }] = await Promise.all([
    appIds.length ? supabase.from("aplicacoes").select("id, entra_id, default_app_role_id").in("id", appIds) : Promise.resolve({ data: [] }) as any,
    grpIds.length ? supabase.from("entra_grupos").select("id, entra_id").in("id", grpIds) : Promise.resolve({ data: [] }) as any,
    licIds.length ? supabase.from("licencas").select("id, sku_id").in("id", licIds) : Promise.resolve({ data: [] }) as any,
  ]);

  const appMap = new Map<string, any>((apps || []).map((a: any) => [a.id, a]));
  const grupoMap = new Map<string, any>((grps || []).map((g: any) => [g.id, g]));
  const licencaMap = new Map<string, any>((lics || []).map((l: any) => [l.id, l]));

  for (const item of ctx.itens) {
    await enqueueItemProvisioning(item, colab as any, { appMap, grupoMap, licencaMap }, decididoPor);
  }
  triggerEntraProcessing();

  await logAuditoria({
    acao: "aprovar",
    entidade: "solicitacao_acesso",
    entidade_id: solicitacaoId,
    resumo: `Solicitação aprovada via workflow: ${ctx.itens.map((i) => i.recurso_nome).join(", ")}`,
    operador: decididoPor,
    detalhes: { motivo },
  });

  if (colab.email) {
    sendNotificationEmail("solicitacao_decidida", {
      destinatario_email: colab.email,
      colaborador_nome: colab.nome || colab.email,
      itens: ctx.itens.map((i) => i.recurso_nome).join(", "),
      status: "aprovada",
      aprovador: decididoPor,
      comentario: motivo,
    });
  }
}

async function finalizeRejection(
  solicitacaoId: string,
  decididoPor: string,
  motivo: string,
): Promise<void> {
  await supabase
    .from("solicitacao_itens")
    .update({
      status: "rejeitado",
      decidido_por: decididoPor,
      decidido_em: new Date().toISOString(),
    } as any)
    .eq("solicitacao_id", solicitacaoId)
    .eq("status", "pendente");

  await supabase
    .from("solicitacoes_acesso")
    .update({
      status: "rejeitada",
      aprovador: decididoPor,
      comentario: motivo,
      data_decisao: new Date().toISOString(),
    } as any)
    .eq("id", solicitacaoId);

  const { data: solic } = await supabase
    .from("solicitacoes_acesso")
    .select("solicitante_id")
    .eq("id", solicitacaoId)
    .maybeSingle();
  if (solic?.solicitante_id) {
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("email, nome")
      .eq("id", solic.solicitante_id)
      .maybeSingle();
    if (colab?.email) {
      sendNotificationEmail("solicitacao_decidida", {
        destinatario_email: colab.email,
        colaborador_nome: colab.nome || colab.email,
        itens: "—",
        status: "rejeitada",
        aprovador: decididoPor,
        comentario: motivo,
      });
    }
  }

  await logAuditoria({
    acao: "rejeitar",
    entidade: "solicitacao_acesso",
    entidade_id: solicitacaoId,
    resumo: `Solicitação rejeitada via workflow: ${motivo}`,
    operador: decididoPor,
  });
}
