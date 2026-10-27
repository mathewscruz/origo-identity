import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, getSupabaseConfig } from "../supabase-client";
import { sanitizarDiagnostico } from "../../appAnalysis";

/** Rotinas que o painel pede ao Hermes; mesma lista fechada de agent_refresh_request. */
export const MCP_AGENT_TASKS = [
  "sync-entra-groups", "sync-entra-licencas", "sync-entra-roles",
  "sync-sharepoint-sites", "sync-app-profiles", "quarantine-triage", "audit-reconciliation", "test-app-connection", "sync-service-accounts",
  "analyze-app-docs",
] as const;

/** Tarefas que o próprio Hermes resolve (não são rotinas do backend). */
export const HERMES_SELF_TASKS = ["analyze-app-docs"] as const;

export function isAllowedAgentTask(task: string): boolean {
  return (MCP_AGENT_TASKS as readonly string[]).includes(task);
}

const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

async function runOne(ctx: ToolContext, t: { id: string; task: string }) {
  const client = sb(ctx);
  if (!isAllowedAgentTask(t.task)) {
    await client.rpc("agent_task_finish", { p_id: t.id, p_status: "error", p_http_status: 400, p_result: "tarefa fora da lista permitida" });
    return { id: t.id, task: t.task, status: "error", http_status: 400 };
  }
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();
  let status = 0; let text = "";
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${t.task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.getToken()}`, apikey: supabasePublishableKey },
      body: JSON.stringify({ trigger: "hermes", agent_task_id: t.id }),
    });
    status = res.status; text = await res.text();
  } catch (e) {
    text = e instanceof Error ? e.message : String(e);
  }
  const ok = status >= 200 && status < 300;
  await client.rpc("agent_task_finish", { p_id: t.id, p_status: ok ? "done" : "error", p_http_status: status || null, p_result: text.slice(0, 2000) });
  await client.from("auditoria").insert({
    acao: "agent_task", entidade: "scheduler", operador: ctx.getUserEmail() ?? "hermes-agent",
    resumo: `Hermes atendeu ${t.task}`, detalhes: { task: t.task, http_status: status, via: "mcp" },
  });
  return { id: t.id, task: t.task, status: ok ? "done" : "error", http_status: status };
}

export const runAgentTasksTool = defineTool({
  name: "run_agent_tasks",
  title: "Atender pedidos de atualização do painel",
  description:
    "Chame em todo ciclo (junto com get_inbox). Reserva os pedidos de atualização feitos pelas telas do painel (licenças, aplicações, grupos, sites, perfis, triagem da quarentena, auditoria), executa cada um e grava o resultado. Respeita a pausa do agente. Não toca identidades.",
  inputSchema: { limit: z.number().int().min(1).max(10).optional().describe("Máximo de pedidos neste ciclo (padrão 5).") },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Não autenticado");
    const { data, error } = await sb(ctx).rpc("agent_task_claim", { p_owner: "hermes-mcp", p_limit: limit ?? 5 });
    if (error) return err(error.message);
    const r = data as { agent_paused: boolean; tasks: { id: string; task: string; payload?: Record<string, unknown> | null }[] };
    if (r.agent_paused) {
      const out = { agent_paused: true, executed: [] as { id: string; task: string; status: string; http_status: number }[] };
      return { content: [{ type: "text", text: "Agente pausado no painel; nada executado." }], structuredContent: out };
    }
    const executed = [];
    const analises_para_voce = [];
    for (const t of r.tasks) {
      if (t.task === "analyze-app-docs") {
        const p = t.payload ?? {};
        let arquivo_url: string | null = null;
        if (typeof p.arquivo_path === "string") {
          const { data: s } = await sb(ctx).storage.from("app-docs").createSignedUrl(p.arquivo_path, 3600);
          arquivo_url = s?.signedUrl ?? null;
        }
        analises_para_voce.push({ id: t.id, aplicacao_id: p.aplicacao_id, url: p.url ?? null, arquivo_nome: p.arquivo_nome ?? null, arquivo_url, observacao: p.observacao ?? null });
        continue;
      }
      executed.push(await runOne(ctx, t));
    }
    const out = {
      agent_paused: false, executed, analises_para_voce,
      ...(analises_para_voce.length ? { instrucao: "Para cada item de analises_para_voce: abra o link/arquivo VOCÊ MESMO, descubra como o sistema dá acesso e responda com submit_app_analysis. Nunca devolva senhas, tokens ou chaves." } : {}),
    };
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  },
});

const acao = z.object({ method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), path: z.string().min(1).max(300), body_template: z.string().max(2000).nullable().optional() }).nullable().optional();

export const submitAppAnalysisTool = defineTool({
  name: "submit_app_analysis",
  title: "Entregar análise de um sistema",
  description:
    "Entrega o diagnóstico de um pedido de analises_para_voce (run_agent_tasks). Você leu o link/arquivo e diz a melhor forma de conectar: 'grupo' (acesso por grupo AD/Entra), 'api' (com endereço, autenticação e como criar/desativar/consultar usuário, usando {{nome}}, {{email}}, {{matricula}}, {{login}}, {{perfil_externo}}) ou 'manual' (com instruções). Liste perfis internos e lacunas. NUNCA inclua senhas, tokens ou chaves. Se não conseguiu ler (login exigido etc.), envie erro.",
  inputSchema: {
    id: z.string().uuid(),
    erro: z.string().max(1000).nullable().optional().describe("Preencha só se não conseguiu analisar."),
    modo_sugerido: z.enum(["grupo", "api", "manual"]).nullable().optional(),
    motivo: z.string().max(1500).nullable().optional(),
    grupo_nome: z.string().max(200).nullable().optional(),
    api_base_url: z.string().max(500).nullable().optional(),
    auth_type: z.enum(["bearer", "api_key", "basic", "oauth2_client_credentials", "app_token"]).nullable().optional(),
    actions: z.object({ create: acao, disable: acao, lookup: acao }).nullable().optional(),
    perfis: z.array(z.string().max(120)).max(50).nullable().optional(),
    instrucoes_acesso: z.string().max(3000).nullable().optional(),
    instrucoes_revogacao: z.string().max(3000).nullable().optional(),
    lacunas: z.array(z.string().max(300)).max(20).nullable().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, erro, ...diag }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Não autenticado");
    const limpo = sanitizarDiagnostico(diag);
    const { data, error } = await sb(ctx).rpc("app_analise_concluir", { p_id: id, p_diagnostico: limpo, p_erro: erro ?? null });
    if (error) return err(error.message);
    const r = { entregue: !!data, segredos_removidos: limpo.segredos_removidos ?? 0 };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  },
});

export const listPendingNotificationsTool = defineTool({
  name: "list_pending_notifications",
  title: "Avisos para enviar no Telegram",
  description:
    "Chame em todo ciclo. Lista avisos e alertas críticos do painel ainda não enviados. Envie cada um pelo seu Telegram e depois chame mark_notifications_sent com os ids.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_i, ctx) => {
    if (!ctx.isAuthenticated()) return err("Não autenticado");
    const since = new Date(Date.now() - 2 * 86400000).toISOString();
    const { data, error } = await sb(ctx).from("alertas").select("id, severidade, titulo, mensagem, ref_url, created_at")
      .is("notificado_em", null).eq("lido", false).in("severidade", ["aviso", "critico"]).gte("created_at", since)
      .order("created_at").limit(50);
    if (error) return err(error.message);
    const alertas = (data ?? []).map((a) => ({
      id: a.id, severidade: String(a.severidade), titulo: a.titulo, mensagem: a.mensagem ?? null,
      link: a.ref_url ?? null, criado_em: a.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(alertas) }], structuredContent: { alertas } };
  },
});

export const markNotificationsSentTool = defineTool({
  name: "mark_notifications_sent",
  title: "Marcar avisos como enviados",
  description: "Marca avisos como já enviados pelo Telegram, para não repetir.",
  inputSchema: { ids: z.array(z.string().uuid()).min(1) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ ids }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Não autenticado");
    const { data, error } = await sb(ctx).rpc("alertas_marcar_notificados", { p_ids: ids });
    if (error) return err(error.message);
    const r = { marcados: Number(data ?? 0) };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  },
});
