import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sb, getSupabaseConfig } from "../supabase-client";

/** Rotinas que o painel pede ao Hermes; mesma lista fechada de agent_refresh_request. */
export const MCP_AGENT_TASKS = [
  "sync-entra-groups", "sync-entra-apps", "sync-entra-licencas", "sync-entra-roles",
  "sync-sharepoint-sites", "sync-app-profiles", "quarantine-triage", "audit-reconciliation", "test-app-connection",
] as const;

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
    const r = data as { agent_paused: boolean; tasks: { id: string; task: string }[] };
    if (r.agent_paused) {
      const out = { agent_paused: true, executed: [] as { id: string; task: string; status: string; http_status: number }[] };
      return { content: [{ type: "text", text: "Agente pausado no painel; nada executado." }], structuredContent: out };
    }
    const executed = [];
    for (const t of r.tasks) {
      executed.push(await runOne(ctx, t));
    }
    const out = { agent_paused: false, executed };
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
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
