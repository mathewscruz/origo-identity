import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

/** Acesso efetivo (perfis ativos + concessões individuais) — o que a pessoa deve ter. */
export default defineTool({
  name: "get_effective_access",
  title: "Acesso efetivo",
  description:
    "Lista o acesso efetivo de um colaborador ou terceiro: recursos concedidos por perfis ativos (cargo, manual, exceção) e concessões individuais, com a origem de cada um. Útil antes de conceder/revogar via request_access.",
  inputSchema: {
    colaborador_id: z.string().uuid().optional(),
    terceiro_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    if (!input.colaborador_id && !input.terceiro_id) return { content: [{ type: "text", text: "Informe colaborador_id ou terceiro_id" }], isError: true };
    const { data, error } = await sb(ctx).rpc("iam_effective_access", {
      p_colaborador_id: input.colaborador_id ?? null, p_terceiro_id: input.terceiro_id ?? null,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = { total: (data ?? []).length, acessos: data };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
