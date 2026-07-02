import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "list_colaboradores",
  title: "Listar colaboradores",
  description:
    "Lista colaboradores do Órigo Access & Identity. Suporta filtros por status, empresa, área, cargo, busca por nome/email e paginação.",
  inputSchema: {
    search: z.string().optional().describe("Filtro por nome ou email (ilike)."),
    status: z.string().optional().describe("Status do colaborador (ex.: ativo, desligado, inativo)."),
    empresa_id: z.string().uuid().optional(),
    area_id: z.string().uuid().optional(),
    cargo_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional().describe("Padrão 50, máximo 200."),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = sb(ctx)
      .from("colaboradores")
      .select("id,nome,email,status,cargo_id,area_id,empresa_id,entra_id,data_admissao,data_desligamento,employ_id", { count: "exact" })
      .range(offset, offset + limit - 1)
      .order("nome");
    if (input.search) q = q.or(`nome.ilike.%${input.search}%,email.ilike.%${input.search}%`);
    if (input.status) q = q.eq("status", input.status);
    if (input.empresa_id) q = q.eq("empresa_id", input.empresa_id);
    if (input.area_id) q = q.eq("area_id", input.area_id);
    if (input.cargo_id) q = q.eq("cargo_id", input.cargo_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify({ total: count, returned: data?.length ?? 0, items: data }) }],
      structuredContent: { total: count, items: data },
    };
  },
});
