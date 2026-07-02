import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient((globalThis as any).process.env.SUPABASE_URL!, (globalThis as any).process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "approve_iam_item",
  title: "Aprovar item da fila IAM",
  description:
    "Aprova (libera para execução) ou cancela um item da fila IAM. Também aceita motivo opcional para auditoria.",
  inputSchema: {
    item_id: z.string().uuid(),
    decision: z.enum(["approve", "cancel"]),
    reason: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ item_id, decision, reason }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const client = sb(ctx);
    const newStatus = decision === "approve" ? "pending" : "cancelled";
    const patch: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (reason) patch.last_error = reason;
    const { data, error } = await client
      .from("iam_queue")
      .update(patch)
      .eq("id", item_id)
      .in("status", ["waiting_approval", "pending"])
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Item não encontrado ou não elegível." }], isError: true };
    await client.from("auditoria").insert({
      acao: decision === "approve" ? "aprovar_iam_item" : "cancelar_iam_item",
      entidade: "iam_queue",
      resumo: `Item ${item_id} ${decision === "approve" ? "aprovado" : "cancelado"} via MCP (Hermes agent)`,
      operador: ctx.getUserEmail() ?? "hermes-agent",
      detalhes: { item_id, decision, reason },
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, item: data }) }],
      structuredContent: { ok: true, item: data },
    };
  },
});
