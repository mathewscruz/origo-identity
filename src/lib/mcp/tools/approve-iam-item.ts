import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

/**
 * Aprovar/rejeitar/cancelar itens da fila IAM via RPC `iam_queue_decidir`.
 * O banco aplica a máquina de estados, grava approved_by = usuário autenticado
 * e recusa auto-aprovação (aprovador ≠ solicitante).
 */
export default defineTool({
  name: "approve_iam_item",
  title: "Decidir item da fila IAM",
  description:
    "Aprova (libera para execução), rejeita ou cancela itens da fila IAM. A decisão é registrada em nome do usuário autenticado; auto-aprovação é recusada pelo banco.",
  inputSchema: {
    item_id: z.string().uuid().optional(),
    item_ids: z.array(z.string().uuid()).optional(),
    decision: z.enum(["approve", "reject", "cancel"]),
    reason: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ item_id, item_ids, decision, reason }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const ids = [...(item_ids ?? []), ...(item_id ? [item_id] : [])];
    if (ids.length === 0) return { content: [{ type: "text", text: "Informe item_id ou item_ids" }], isError: true };
    const { data, error } = await sb(ctx).rpc("iam_queue_decidir", {
      p_ids: ids,
      p_decisao: decision,
      p_motivo: reason ?? null,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = { ok: true, decision, ids, ...(data as Record<string, unknown>) };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
