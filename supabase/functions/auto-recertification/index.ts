// Recertificação e ciclo de terceiros (agendada: pg_cron 05:15 UTC; também manual/MCP).
//   1. Campanhas de revisão por APLICAÇÃO (owner) a cada `revisao_periodicidade_dias`
//      e por GESTOR (equipe) a cada `revisao_gestor_periodicidade_dias` — via RPC revisao_criar
//   2. Lembretes 3 dias antes do prazo / campanhas atrasadas (alerta + e-mail, 1×/dia)
//   3. Terceiros com contrato vencido → desligamento (RPC terceiro_alterar_status)
//   4. Terceiros a revalidar (`terceiro_revalidacao_dias`) → campanha por responsável
//      (RPC revisao_criar_por_responsaveis) com link externo por e-mail; sem resposta até o
//      prazo (`terceiro_revalidacao_prazo_dias`) a campanha é concluída com "desligar" e os
//      terceiros são desativados (contas/acessos removidos pelo agente)
// Só lê/escreve no banco; toda execução em diretório é do Órigo Agente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRoleOrService, serviceAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const SITE_URL = (Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app").replace(/\/$/, "");
  const results = { revisoes_app_criadas: 0, revisoes_gestor_criadas: 0, revalidacoes_criadas: 0, lembretes: 0, atrasadas: 0, terceiros_expirados: 0, terceiros_desativados_prazo: 0, errors: [] as string[] };

  const param = async (chave: string, def: number) => {
    const { data } = await sb.from("parametros").select("valor").eq("chave", chave).maybeSingle();
    const n = parseInt(String(data?.valor ?? ""), 10);
    return Number.isFinite(n) ? n : def;
  };
  const notify = (tipo: string, payload: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: serviceAuthHeader() }, body: JSON.stringify({ tipo, payload }),
    }).catch((e) => console.warn("[auto-recertification] notify:", e));
  const sendReviewEmail = (revisaoId: string) =>
    fetch(`${SUPABASE_URL}/functions/v1/send-review-email`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: serviceAuthHeader() }, body: JSON.stringify({ revisao_id: revisaoId }),
    }).catch((e) => console.warn("[auto-recertification] review email:", e));

  try {
    const today = new Date(); const hoje = today.toISOString().slice(0, 10);
    const periodDays = await param("revisao_periodicidade_dias", 90);
    const gestorDays = await param("revisao_gestor_periodicidade_dias", 180);
    const cutoff = new Date(today.getTime() - periodDays * 86400000).toISOString();
    const prazo = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

    // ── 1a. campanhas por aplicação (owner) ──
    const { data: apps } = await sb.from("aplicacoes").select("id, nome, owner").not("owner", "is", null).neq("owner", "");
    for (const app of (apps || []) as Row[]) {
      const { count } = await sb.from("revisoes").select("id", { count: "exact", head: true }).eq("aplicacao_id", app.id).gte("created_at", cutoff);
      if ((count || 0) > 0) continue;
      const { data: r, error } = await sb.rpc("revisao_criar", { p_tipo: "aplicacao", p_aplicacao_id: app.id, p_gestor_id: null, p_data_fim: prazo, p_nome: `Recertificação — ${app.nome}`, p_operador: "sistema" });
      if (error || r?.ok === false) { results.errors.push(`revisão ${app.nome}: ${error?.message || r?.error}`); continue; }
      if (r?.existente) continue;
      if ((r?.total_itens ?? 0) === 0) { await sb.rpc("revisao_cancelar", { p_revisao_id: r.id, p_motivo: "Sem acessos para revisar" }); continue; }
      results.revisoes_app_criadas++;
      if (r?.owner_email) await sendReviewEmail(r.id);
      else await sb.from("alertas").insert({ titulo: `Revisão sem responsável: ${app.nome}`, mensagem: `Não foi possível resolver o e-mail do owner "${app.owner}". Defina o owner da aplicação com e-mail para o link de revisão ser enviado.`, severidade: "aviso", tipo: "recertificacao", ref_tipo: "revisao", ref_id: r.id, ref_url: `/revisoes/${r.id}` });
    }

    // ── 1b. campanhas por gestor (equipe) ──
    if (gestorDays > 0) {
      const gCutoff = new Date(today.getTime() - gestorDays * 86400000).toISOString();
      const { count } = await sb.from("revisoes").select("id", { count: "exact", head: true }).eq("tipo", "gestor").gte("created_at", gCutoff);
      if ((count || 0) === 0) {
        const { data: r, error } = await sb.rpc("revisao_criar_por_gestores", { p_data_fim: prazo, p_operador: "sistema" });
        if (error) results.errors.push(`revisões por gestor: ${error.message}`);
        else {
          results.revisoes_gestor_criadas = r?.criadas ?? 0;
          for (const id of (r?.ids || []) as string[]) await sendReviewEmail(id);
        }
      }
    }

    // ── 1c. revalidação de terceiros: uma campanha por responsável com terceiros vencidos ──
    {
      const { data: r, error } = await sb.rpc("revisao_criar_por_responsaveis", { p_data_fim: null, p_operador: "sistema", p_somente_vencidos: true });
      if (error) results.errors.push(`revalidação de terceiros: ${error.message}`);
      else {
        results.revalidacoes_criadas = r?.criadas ?? 0;
        for (const id of (r?.ids || []) as string[]) await sendReviewEmail(id);
      }
    }

    // ── 1d. prazo expirado em revalidação de terceiros → sem resposta = desligar ──
    const { data: vencidasTerc } = await sb.from("revisoes").select("id, nome, owner_email, data_fim").eq("status", "em_andamento").eq("tipo", "terceiros").not("owner_email", "is", null).lt("data_fim", hoje);
    for (const rv of (vencidasTerc || []) as Row[]) {
      const { data: itens } = await sb.from("revisao_itens").select("colaborador_nome").eq("revisao_id", rv.id).is("decisao", null);
      const { data: res, error } = await sb.rpc("revisao_concluir", { p_revisao_id: rv.id, p_decidido_por: "sistema", p_sem_decisao: "revogar" });
      if (error || res?.ok === false) { results.errors.push(`prazo revalidação ${rv.nome}: ${error?.message || res?.error}`); continue; }
      results.terceiros_desativados_prazo += Number(res?.automaticos ?? 0);
      await notify("terceiros_desativados_prazo", { destinatario_email: rv.owner_email, revisao_nome: rv.nome, revisao_id: rv.id, prazo: new Date(rv.data_fim).toLocaleDateString("pt-BR"), mantidos: res?.mantidos ?? 0, desativados: res?.automaticos ?? 0, nomes: ((itens || []) as Row[]).map((i) => i.colaborador_nome) });
    }

    // ── 1e. lembretes e atraso ──
    const { data: abertas } = await sb.from("revisoes").select("id, nome, tipo, owner_email, data_fim, total_itens, itens_revisados, lembrete_enviado_em, token").eq("status", "em_andamento").not("data_fim", "is", null);
    for (const rv of (abertas || []) as Row[]) {
      const diasRestantes = Math.ceil((new Date(rv.data_fim).getTime() - today.getTime()) / 86400000);
      const pendentes = (rv.total_itens || 0) - (rv.itens_revisados || 0);
      if (pendentes <= 0 || diasRestantes > 3) continue;
      const lastReminder = rv.lembrete_enviado_em ? new Date(rv.lembrete_enviado_em).getTime() : 0;
      if (today.getTime() - lastReminder < 23 * 3600000) continue;
      if (rv.owner_email) {
        await notify("revisao_lembrete", { destinatario_email: rv.owner_email, revisao_nome: rv.nome, revisao_id: rv.id, prazo: new Date(rv.data_fim).toLocaleDateString("pt-BR"), pendentes, link_externo: `${SITE_URL}/revisao-externa/${rv.token}` });
        results.lembretes++;
      }
      if (diasRestantes < 0) {
        results.atrasadas++;
        const { count } = await sb.from("alertas").select("id", { count: "exact", head: true }).eq("tipo", "revisao_atrasada").eq("ref_id", rv.id).gte("created_at", new Date(today.getTime() - 7 * 86400000).toISOString());
        if (!count) await sb.from("alertas").insert({ titulo: `Revisão atrasada: ${rv.nome}`, mensagem: `${pendentes} item(ns) sem decisão; prazo era ${new Date(rv.data_fim).toLocaleDateString("pt-BR")}. Responsável: ${rv.owner_email || "—"}.`, severidade: "critico", tipo: "revisao_atrasada", ref_tipo: "revisao", ref_id: rv.id, ref_url: `/revisoes/${rv.id}` });
      }
      await sb.from("revisoes").update({ lembrete_enviado_em: today.toISOString() }).eq("id", rv.id);
    }

    // ── 2. terceiros com contrato vencido → desligamento ──
    const resolveResponsavelEmail = async (t: Row): Promise<string | null> => {
      if (t.responsavel_colaborador_id) {
        const { data: c } = await sb.from("colaboradores").select("email").eq("id", t.responsavel_colaborador_id).maybeSingle();
        if (c?.email) return c.email;
      }
      const { data: e } = await sb.rpc("iam_resolve_email", { p_text: t.responsavel || "" });
      return (e as string | null) || null;
    };
    const { data: expirados } = await sb.from("terceiros").select("id, nome, email, contrato_fim, responsavel, responsavel_colaborador_id").eq("ativo", true).not("contrato_fim", "is", null).lte("contrato_fim", hoje);
    for (const t of (expirados || []) as Row[]) {
      const { data: r, error } = await sb.rpc("terceiro_alterar_status", { p_terceiro_id: t.id, p_ativo: false, p_operador: "sistema", p_origem: "auto_expiracao", p_motivo: `Contrato encerrado em ${t.contrato_fim}` });
      if (error || r?.ok === false) { results.errors.push(`terceiro ${t.nome}: ${error?.message || r?.error}`); continue; }
      results.terceiros_expirados++;
      const to = await resolveResponsavelEmail(t);
      if (to) await notify("terceiro_expirando", { destinatario_email: to, terceiro_nome: t.nome, terceiro_id: t.id, contrato_fim: new Date(t.contrato_fim).toLocaleDateString("pt-BR"), responsavel: t.responsavel });
    }

    return new Response(JSON.stringify(results), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("auto-recertification error:", msg);
    return new Response(JSON.stringify({ error: msg, ...results }), { status: 500, headers: corsHeaders });
  }
});
