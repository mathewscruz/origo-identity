import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "list_terceiros",
  title: "Listar terceiros",
  description: "Lista terceiros com filtros por status, empresa e busca por nome/email.",
  inputSchema: {
    search: z.string().optional(),
    status: z.string().optional(),
    empresa_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = sb(ctx).from("terceiros").select("*", { count: "exact" }).order("nome").range(offset, offset + limit - 1);
    if (input.search) q = q.or(`nome.ilike.%${input.search}%,email.ilike.%${input.search}%`);
    if (input.status) q = q.eq("status", input.status);
    if (input.empresa_id) q = q.eq("empresa_id", input.empresa_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ total: count, items: data }) }],
      structuredContent: { total: count, items: data },
    };
  },
});
