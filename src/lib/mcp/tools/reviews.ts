import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function rpcResult(data: unknown, error: { message: string } | null) {
  if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };
  const r = (data ?? {}) as Record<string, unknown>;
  return { content: [{ type: "text" as const, text: JSON.stringify(r) }], structuredContent: r, isError: r?.ok === false };
}

/** Campanhas de revisão de acesso (recertificação) */
export const listReviewsTool = defineTool({
  name: "list_reviews",
  title: "Listar revisões de acesso",
  description: "Lista campanhas de revisão (por aplicação ou por gestor) com status, prazo, progresso e responsável. Use status=em_andamento para o que ainda espera decisão.",
  inputSchema: {
    status: z.enum(["em_andamento", "concluida", "cancelada"]).optional(),
    tipo: z.enum(["aplicacao", "gestor", "terceiros"]).optional(),
    atrasadas: z.boolean().optional().describe("Somente em andamento com prazo vencido"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    let q = sb(ctx).from("revisoes")
      .select("id, nome, tipo, status, responsavel, owner_email, data_inicio, data_fim, total_itens, itens_revisados, resultado, concluida_em, concluida_por, criada_por, aplicacao_id, gestor_id, created_at")
      .order("created_at", { ascending: false }).limit(input.limit ?? 50);
    if (input.status) q = q.eq("status", input.status);
    if (input.tipo) q = q.eq("tipo", input.tipo);
    if (input.atrasadas) q = q.eq("status", "em_andamento").lt("data_fim", new Date().toISOString().slice(0, 10));
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const items = (data ?? []).map((r: Row) => ({ ...r, pendentes: (r.total_itens ?? 0) - (r.itens_revisados ?? 0), atrasada: r.status === "em_andamento" && r.data_fim && r.data_fim < new Date().toISOString().slice(0, 10) }));
    return { content: [{ type: "text", text: JSON.stringify({ total: items.length, items }) }], structuredContent: { total: items.length, items } };
  },
});

export const getReviewTool = defineTool({
  name: "get_review",
  title: "Detalhar revisão",
  description: "Campanha de revisão com todos os itens (pessoa, acesso, origem, decisão, justificativa, quem decidiu, executado_em) e as ações da fila geradas por ela.",
  inputSchema: { revisao_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const client = sb(ctx);
    const [{ data: revisao, error: e1 }, { data: itens, error: e2 }, { data: fila }] = await Promise.all([
      client.from("revisoes").select("*, aplicacoes(nome), gestor:colaboradores(nome, email)").eq("id", input.revisao_id).maybeSingle(),
      client.from("revisao_itens").select("id, tipo, colaborador_id, terceiro_id, colaborador_nome, perfil_id, perfil_nome, recurso_nome, resource_key, origem, cargo_nome, area_nome, decisao, justificativa, decidido_por, decidido_em, executado_em").eq("revisao_id", input.revisao_id).order("colaborador_nome"),
      client.from("iam_queue").select("id, action_type, status, target_identity, result_message, processed_at, created_at").eq("requested_by", `revisao:${input.revisao_id}`).order("created_at"),
    ]);
    if (e1 || e2) return { content: [{ type: "text", text: (e1 || e2)!.message }], isError: true };
    if (!revisao) return { content: [{ type: "text", text: "Revisão não encontrada" }], isError: true };
    const r = revisao as Row;
    if (r.token) delete r.token; // o link externo não sai por aqui
    const out = { revisao: r, itens: itens ?? [], execucao: fila ?? [] };
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  },
});

export const createReviewTool = defineTool({
  name: "create_review",
  title: "Criar campanha de revisão",
  description:
    "Abre uma campanha de revisão: 'aplicacao' (owner decide quem mantém/perde cada acesso), 'gestor' (gestor revisa a equipe), 'todos_gestores' (uma por gestor), 'terceiros' (responsável — gestor_id = colaborador — revalida ou desliga cada terceiro; prazo = terceiro_revalidacao_prazo_dias e sem resposta os terceiros são desativados) ou 'todos_responsaveis' (uma revalidação por responsável). O responsável recebe o link por e-mail (send-review-email). Se já existir campanha em andamento para o mesmo alvo, devolve existente=true.",
  inputSchema: {
    tipo: z.enum(["aplicacao", "gestor", "todos_gestores", "terceiros", "todos_responsaveis"]),
    aplicacao_id: z.string().uuid().optional(),
    gestor_id: z.string().uuid().optional().describe("colaborador_id do gestor (ou do responsável, em tipo=terceiros)"),
    somente_vencidos: z.boolean().optional().describe("tipo=todos_responsaveis: só responsáveis com terceiros vencidos (padrão false = todos)"),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Prazo (YYYY-MM-DD); padrão 14 dias"),
    nome: z.string().optional(),
    enviar_email: z.boolean().optional().describe("Enviar o link ao responsável (padrão true)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const client = sb(ctx);
    const sendMail = async (id: string) => {
      const { data, error } = await client.functions.invoke("send-review-email", { body: { revisao_id: id } });
      return error ? `erro: ${error.message}` : (data as Row)?.error ? `erro: ${(data as Row).error}` : "enviado";
    };
    if (input.tipo === "todos_responsaveis") {
      const { data, error } = await client.rpc("revisao_criar_por_responsaveis", { p_data_fim: input.data_fim ?? null, p_operador: "hermes", p_somente_vencidos: input.somente_vencidos ?? false });
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      const r = (data ?? {}) as Row;
      const emails: Record<string, string> = {};
      if (input.enviar_email !== false) for (const id of (r.ids || []) as string[]) emails[id] = await sendMail(id);
      const out = { ...r, emails };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    }
    if (input.tipo === "todos_gestores") {
      const { data, error } = await client.rpc("revisao_criar_por_gestores", { p_data_fim: input.data_fim ?? null, p_operador: "hermes" });
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      const r = (data ?? {}) as Row;
      const emails: Record<string, string> = {};
      if (input.enviar_email !== false) for (const id of (r.ids || []) as string[]) emails[id] = await sendMail(id);
      const out = { ...r, emails };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    }
    if (input.tipo === "aplicacao" && !input.aplicacao_id) return { content: [{ type: "text", text: "aplicacao_id é obrigatório para tipo=aplicacao" }], isError: true };
    if ((input.tipo === "gestor" || input.tipo === "terceiros") && !input.gestor_id) return { content: [{ type: "text", text: "gestor_id é obrigatório para tipo=gestor/terceiros" }], isError: true };
    const { data, error } = await client.rpc("revisao_criar", {
      p_tipo: input.tipo, p_aplicacao_id: input.aplicacao_id ?? null, p_gestor_id: input.gestor_id ?? null,
      p_data_fim: input.data_fim ?? null, p_nome: input.nome ?? null, p_operador: "hermes", p_responsavel: null,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const r = (data ?? {}) as Row;
    let email: string | null = null;
    if (r.ok !== false && !r.existente && r.owner_email && input.enviar_email !== false) email = await sendMail(r.id);
    const out = { ...r, email };
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: r?.ok === false };
  },
});

export const decideReviewTool = defineTool({
  name: "decide_review_items",
  title: "Registrar decisões de revisão",
  description:
    "Registra decisões (manter|revogar) em itens de uma campanha em andamento, em nome de quem decidiu (o gestor/owner que respondeu no chamado, por exemplo). Não executa nada até close_review.",
  inputSchema: {
    revisao_id: z.string().uuid(),
    decisoes: z.record(z.string().uuid(), z.enum(["manter", "revogar"])).describe("{ item_id: 'manter'|'revogar' }"),
    justificativas: z.record(z.string().uuid(), z.string()).optional().describe("{ item_id: 'motivo' }"),
    decidido_por: z.string().optional().describe("Quem decidiu (e-mail/nome); padrão: usuário conectado"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("revisao_decidir_itens", {
      p_revisao_id: input.revisao_id, p_decisoes: input.decisoes, p_justificativas: input.justificativas ?? {}, p_decidido_por: input.decidido_por ?? null,
    });
    return rpcResult(data, error);
  },
});

export const closeReviewTool = defineTool({
  name: "close_review",
  title: "Concluir revisão e executar",
  description:
    "Conclui a campanha: itens 'revogar' perdem o acesso (em tipo=terceiros: o terceiro é desligado) — as ações entram na fila JÁ APROVADAS (a decisão do responsável é a aprovação) e o Órigo Agente executa; itens sem decisão são mantidos, salvo sem_decisao='revogar' (uso do prazo expirado). Devolve mantidos/revogados/ações enfileiradas.",
  inputSchema: { revisao_id: z.string().uuid(), decidido_por: z.string().optional(), sem_decisao: z.enum(["manter", "revogar"]).optional() },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("revisao_concluir", { p_revisao_id: input.revisao_id, p_decidido_por: input.decidido_por ?? null, p_sem_decisao: input.sem_decisao ?? "manter" });
    return rpcResult(data, error);
  },
});

export const cancelReviewTool = defineTool({
  name: "cancel_review",
  title: "Cancelar revisão",
  description: "Cancela uma campanha em andamento sem executar nada (ex.: aberta por engano ou sem itens).",
  inputSchema: { revisao_id: z.string().uuid(), motivo: z.string().min(3) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("revisao_cancelar", { p_revisao_id: input.revisao_id, p_motivo: input.motivo });
    return rpcResult(data, error);
  },
});
