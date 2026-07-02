import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb, getSupabaseConfig } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "invoke_edge_function",
  title: "Invocar Edge Function",
  description:
    "Chama qualquer Edge Function do projeto Órigo (ex.: reconcile-identities, process-iam-queue, sync-entra-groups, start-jml-event, etc.). Encaminha o JWT do usuário conectado — a função-alvo aplica suas próprias regras. Requer papel admin.",
  inputSchema: {
    name: z.string().min(1).describe("Nome da edge function (sem prefixo)."),
    payload: z.any().optional().describe("Corpo JSON opcional a enviar."),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().describe("Padrão POST."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ name, payload, method }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };

    // Gate por admin usando has_role
    const { data: isAdmin, error: roleErr } = await sb(ctx).rpc("has_role", {
      _user_id: ctx.getUserId(),
      _role: "admin",
    });
    if (roleErr) return { content: [{ type: "text", text: roleErr.message }], isError: true };
    if (!isAdmin) return { content: [{ type: "text", text: "Acesso negado: requer papel admin" }], isError: true };

    const base = getSupabaseConfig().supabaseUrl;
    const apikey = getSupabaseConfig().supabasePublishableKey;
    const url = `${base}/functions/v1/${encodeURIComponent(name)}`;
    const m = method ?? "POST";
    const res = await fetch(url, {
      method: m,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken()}`,
        apikey,
      },
      body: m === "GET" ? undefined : JSON.stringify(payload ?? {}),
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep as text */ }

    await sb(ctx).from("auditoria").insert({
      acao: "invoke_edge_function",
      entidade: "edge_function",
      resumo: `Invocação de ${name} via MCP (Hermes)`,
      operador: ctx.getUserEmail() ?? "hermes-agent",
      detalhes: { name, method: m, payload, status: res.status, response: body },
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ status: res.status, body }) }],
      structuredContent: { status: res.status, body },
      isError: !res.ok,
    };
  },
});
