import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

/** Catálogo de recursos para resolver nomes de chamados em ids (request_access). */
export default defineTool({
  name: "list_catalog",
  title: "Catálogo de recursos",
  description:
    "Lista o catálogo governado (perfis de acesso, grupos do Entra, licenças, aplicações, sites SharePoint) com busca por nome — use para transformar o texto de um chamado nos ids que request_access exige.",
  inputSchema: {
    tipo: z.enum(["perfil", "grupo", "licenca", "app", "sharepoint", "cargo"]),
    busca: z.string().optional().describe("Trecho do nome (case-insensitive)"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const client = sb(ctx);
    const limit = input.limit ?? 50;
    const table = { perfil: "perfis_acesso", grupo: "entra_grupos", licenca: "entra_licencas", app: "aplicacoes", sharepoint: "sharepoint_sites", cargo: "cargos" }[input.tipo];
    const cols = {
      perfil: "id, nome, descricao, tipo, ativo",
      grupo: "id, nome, entra_id, on_premises_sync",
      licenca: "id, nome, friendly_name, sku_id, total, em_uso",
      app: "id, nome, entra_id, origem, criticidade, connector_type",
      sharepoint: "id, nome, url, site_id",
      cargo: "id, nome, ativo",
    }[input.tipo];
    let q = client.from(table as never).select(cols).order("nome").limit(limit);
    if (input.busca) q = q.ilike("nome", `%${input.busca.replace(/[%,()]/g, " ")}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = { tipo: input.tipo, total: (data ?? []).length, items: data };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
