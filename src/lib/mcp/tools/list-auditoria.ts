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
  name: "list_auditoria",
  title: "Consultar auditoria",
  description: "Consulta o log de auditoria com filtros por ação, entidade, operador e intervalo de datas.",
  inputSchema: {
    acao: z.string().optional(),
    entidade: z.string().optional(),
    operador: z.string().optional(),
    since: z.string().optional().describe("ISO date, ex.: 2026-06-01"),
    until: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = sb(ctx).from("auditoria").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (input.acao) q = q.eq("acao", input.acao);
    if (input.entidade) q = q.eq("entidade", input.entidade);
    if (input.operador) q = q.eq("operador", input.operador);
    if (input.since) q = q.gte("created_at", input.since);
    if (input.until) q = q.lte("created_at", input.until);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ total: count, items: data }) }],
      structuredContent: { total: count, items: data },
    };
  },
});
