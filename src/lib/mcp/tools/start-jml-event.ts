import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb, getSupabaseConfig } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "start_jml_event",
  title: "Iniciar evento JML",
  description:
    "Executa um evento JML para um colaborador via Edge Function start-jml-event: leaver (desligamento: desabilita contas e enfileira remoção de acessos), joiner (reativação/recontratação, reabilitação aguarda aprovação), mover (mudança de cargo — exige novoCargoId), pre_leaver (suspensão preventiva) e pre_leaver_revertido. Informe colaboradorId sempre que possível; nome só funciona quando é único.",
  inputSchema: {
    tipo: z.enum(["joiner", "mover", "leaver", "pre_leaver", "pre_leaver_revertido"]),
    colaboradorId: z.string().uuid().nullable().optional(),
    colaboradorNome: z.string().optional(),
    motivo: z.string().min(3),
    novoCargoId: z.string().uuid().optional(),
    statusFinal: z.enum(["desligado", "inativo"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const url = `${getSupabaseConfig().supabaseUrl}/functions/v1/start-jml-event`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken()}`,
        apikey: getSupabaseConfig().supabasePublishableKey,
      },
      body: JSON.stringify({ ...input, origem: "mcp_hermes" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body as { error?: string })?.error) {
      return { content: [{ type: "text", text: JSON.stringify(body) }], isError: true };
    }
    // Best-effort audit
    await sb(ctx).from("auditoria").insert({
      acao: "iniciar_evento_jml",
      entidade: "eventos_jml",
      resumo: `Evento JML ${input.tipo} executado via MCP (Hermes) para ${input.colaboradorNome ?? input.colaboradorId}`,
      operador: ctx.getUserEmail() ?? "hermes-agent",
      detalhes: { input, response: body },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(body) }],
      structuredContent: body,
    };
  },
});
