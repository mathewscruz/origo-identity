import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

function rpcResult(data: unknown, error: { message: string } | null) {
  if (error) return { content: [{ type: "text" as const, text: error.message }], isError: true };
  const r = (typeof data === "object" && data !== null ? data : { ok: true, result: data }) as Record<string, unknown>;
  return { content: [{ type: "text" as const, text: JSON.stringify(r) }], structuredContent: r, isError: r?.ok === false };
}

/** Exceções de acesso (pedidos fora do perfil do cargo) */
export const decideExceptionTool = defineTool({
  name: "decide_exception",
  title: "Decidir exceção de acesso",
  description:
    "Aprova ou rejeita uma exceção de acesso pendente (get_inbox → excecoes_pendentes). Aprovar atribui o perfil e enfileira as concessões para o Órigo Agente; a decisão fica em nome do usuário conectado.",
  inputSchema: {
    excecao_id: z.string().uuid(),
    decisao: z.enum(["aprovada", "rejeitada"]),
    comentario: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("excecao_decidir", { p_id: input.excecao_id, p_decisao: input.decisao, p_comentario: input.comentario ?? null });
    return rpcResult(data, error);
  },
});

/** Quarentena da importação do RH */
export const resolveQuarantineTool = defineTool({
  name: "resolve_quarantine",
  title: "Resolver item da quarentena do RH",
  description:
    "Marca uma linha da quarentena da importação do RH como 'resolvido' (o RH corrigiu a base; a próxima importação reavalia) ou 'descartado' (falso positivo). Não altera colaboradores.",
  inputSchema: {
    quarentena_id: z.string().uuid(),
    status: z.enum(["resolvido", "descartado"]),
    observacao: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("quarentena_decidir", { p_id: input.quarentena_id, p_status: input.status, p_observacao: input.observacao ?? null });
    return rpcResult(data, error);
  },
});

/** Alertas */
export const ackAlertsTool = defineTool({
  name: "ack_alerts",
  title: "Marcar alertas como lidos",
  description: "Marca alertas como lidos (ids específicos ou todos os não lidos quando ids é omitido). Use depois de tratar a causa.",
  inputSchema: { ids: z.array(z.string().uuid()).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("alertas_marcar_lidos", { p_ids: input.ids ?? null });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const r = { ok: true, marcados: Number(data ?? 0) };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  },
});

/** Terceiros: revalidação / renovação e desligamento/reativação */
export const revalidateTerceiroTool = defineTool({
  name: "revalidate_terceiro",
  title: "Revalidar terceiro",
  description:
    "Registra a revalidação do acesso de um terceiro pelo responsável (reinicia o prazo de revalidação e fecha os alertas). Opcionalmente renova o contrato (novo_contrato_fim, YYYY-MM-DD) — a expiração da conta no AD acompanha a nova data no próximo ciclo do agente.",
  inputSchema: {
    terceiro_id: z.string().uuid(),
    novo_contrato_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    motivo: z.string().optional().describe("Ex.: GLPI #123 — responsável confirmou"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("terceiro_revalidar", { p_terceiro_id: input.terceiro_id, p_novo_contrato_fim: input.novo_contrato_fim ?? null, p_motivo: input.motivo ?? null });
    return rpcResult(data, error);
  },
});

export const setTerceiroStatusTool = defineTool({
  name: "set_terceiro_status",
  title: "Desligar ou reativar terceiro",
  description:
    "Desliga (ativo=false: revoga perfis, desabilita contas e enfileira remoções) ou reativa (ativo=true: restaura perfis do último desligamento; reabilitação de contas aguarda aprovação) um terceiro. Tudo executado pelo Órigo Agente.",
  inputSchema: {
    terceiro_id: z.string().uuid(),
    ativo: z.boolean(),
    motivo: z.string().min(3).describe("Justificativa — ex.: GLPI #123, fim de contrato"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("terceiro_alterar_status", { p_terceiro_id: input.terceiro_id, p_ativo: input.ativo, p_operador: "hermes", p_origem: "manual", p_motivo: input.motivo });
    return rpcResult(data, error);
  },
});

/** Fila: reprocessar falhas em lote */
export const retryFailedTool = defineTool({
  name: "retry_failed_items",
  title: "Reprocessar falhas da fila",
  description: "Recoloca em 'pending' os itens da fila com status 'failed' (opcionalmente só alguns action_types) para o Órigo Agente tentar de novo. Use depois de corrigir a causa (get_inbox → falhas).",
  inputSchema: { action_types: z.array(z.string()).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("iam_queue_reprocessar_falhas", { p_action_types: input.action_types ?? null });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const r = { ok: true, reprocessados: Number(data ?? 0) };
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  },
});
