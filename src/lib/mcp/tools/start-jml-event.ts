import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient((globalThis as any).process.env.SUPABASE_URL!, (globalThis as any).process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "start_jml_event",
  title: "Iniciar evento JML",
  description:
    "Inicia um evento JML (Joiner/Mover/Leaver/Pré-Leaver) para um colaborador. Chama a Edge Function start-jml-event, respeitando as regras internas.",
  inputSchema: {
    tipo: z.enum(["joiner", "mover", "leaver", "pre_leaver"]),
    colaboradorId: z.string().uuid().nullable().optional(),
    colaboradorNome: z.string(),
    motivo: z.string().min(3),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const url = `${(globalThis as any).process.env.SUPABASE_URL}/functions/v1/start-jml-event`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.getToken()}`,
        apikey: (globalThis as any).process.env.SUPABASE_PUBLISHABLE_KEY!,
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
      resumo: `Evento JML ${input.tipo} iniciado via MCP (Hermes) para ${input.colaboradorNome}`,
      operador: ctx.getUserEmail() ?? "hermes-agent",
      detalhes: { input, response: body },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(body) }],
      structuredContent: body,
    };
  },
});
