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
  name: "list_eventos_jml",
  title: "Listar eventos JML",
  description: "Lista eventos JML (Joiner/Mover/Leaver/Pré-Leaver) com filtros de tipo, status e colaborador.",
  inputSchema: {
    tipo: z.string().optional(),
    status: z.string().optional(),
    colaborador_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = sb(ctx).from("eventos_jml").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (input.tipo) q = q.eq("tipo", input.tipo);
    if (input.status) q = q.eq("status", input.status);
    if (input.colaborador_id) q = q.eq("colaborador_id", input.colaborador_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ total: count, items: data }) }],
      structuredContent: { total: count, items: data },
    };
  },
});
