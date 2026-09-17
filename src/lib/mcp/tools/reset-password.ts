import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

/**
 * Reset de senha via fila: o Órigo Agente executa (AD ou Entra) e a senha temporária
 * é entregue por e-mail ao usuário OAuth conectado — nunca gravada nem devolvida aqui.
 */
export default defineTool({
  name: "reset_password",
  title: "Resetar senha",
  description:
    "Solicita reset de senha de um colaborador ou terceiro. Entra na fila IAM (sujeito a aprovação) e é executado pelo Órigo Agente; a senha temporária é enviada por e-mail ao usuário conectado. Contas privilegiadas exigem papel admin.",
  inputSchema: {
    colaborador_id: z.string().uuid().optional(),
    terceiro_id: z.string().uuid().optional(),
    motivo: z.string().min(3).describe("Justificativa — ex.: GLPI #12345"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    if (!input.colaborador_id && !input.terceiro_id) return { content: [{ type: "text", text: "Informe colaborador_id ou terceiro_id" }], isError: true };
    const { data, error } = await sb(ctx).rpc("iam_enqueue_reset_password", {
      p_colaborador_id: input.colaborador_id ?? null, p_terceiro_id: input.terceiro_id ?? null, p_motivo: input.motivo,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = data as Record<string, unknown>;
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: result?.ok === false };
  },
});
