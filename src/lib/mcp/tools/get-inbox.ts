import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";

/**
 * Caixa de entrada operacional do Hermes: tudo o que espera decisão ou atenção,
 * em uma chamada (RPC hermes_inbox). É o ponto de partida de cada ciclo do agente.
 */
export default defineTool({
  name: "get_inbox",
  title: "Caixa de entrada do Hermes",
  description:
    "Resumo operacional em uma chamada: fila (por status), aprovações pendentes, falhas, exceções pendentes, revisões abertas/atrasadas, quarentena do RH, terceiros vencendo/para revalidar, alertas críticos não lidos, status do agente e do último ciclo diário. Comece por aqui em todo ciclo.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("hermes_inbox");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const inbox = data as Record<string, unknown>;
    return { content: [{ type: "text", text: JSON.stringify(inbox) }], structuredContent: inbox };
  },
});
