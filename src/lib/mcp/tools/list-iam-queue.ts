import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_iam_queue",
  title: "Listar fila IAM",
  description:
    "Lista itens da fila IAM (provisionamento/revogação). Filtra por status, tipo de ação, requester e colaborador.",
  inputSchema: {
    status: z.array(z.string()).optional().describe("Ex.: ['pending','waiting_approval','processing','success','failed','cancelled']"),
    action_type: z.string().optional(),
    requested_by: z.string().optional(),
    colaborador_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = sb(ctx)
      .from("iam_queue")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (input.status?.length) q = q.in("status", input.status);
    if (input.action_type) q = q.eq("action_type", input.action_type);
    if (input.requested_by) q = q.eq("requested_by", input.requested_by);
    if (input.colaborador_id) q = q.eq("colaborador_id", input.colaborador_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ total: count, items: data }) }],
      structuredContent: { total: count, items: data },
    };
  },
});
