import { defineTool } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";

/**
 * Concessão/revogação de acesso para uma identidade (colaborador ou terceiro) —
 * o caminho correto para chamados do GLPI tratados pelo Hermes.
 *
 * Tudo passa pelas RPCs de acesso efetivo do banco: o item entra na fila
 * (aguardando aprovação quando o gate está ligado) e SÓ o Órigo Agente executa.
 * Remoções respeitam outros perfis/concessões que ainda concedem o recurso.
 */
const recurso = z.object({
  tipo: z.enum(["grupo", "licenca", "app", "sharepoint", "perfil"]).describe("perfil = perfil de acesso; os demais são recursos individuais"),
  id: z.string().uuid().describe("id do catálogo (entra_grupos.id, entra_licencas.id, aplicacoes.id, sharepoint_sites.id ou perfis_acesso.id) — use list_catalog para resolver nomes"),
  pasta_id: z.string().uuid().optional().describe("sharepoint: pasta (sharepoint_pastas.id); omitido = raiz do site"),
  permissao: z.enum(["leitura", "edicao"]).optional().describe("sharepoint: padrão leitura"),
});

export default defineTool({
  name: "request_access",
  title: "Conceder / revogar acesso",
  description:
    "Concede ou revoga acessos (perfil de acesso, grupo, licença, app ou pasta SharePoint) para um colaborador ou terceiro. Gera itens na fila IAM (aguardando aprovação quando o modo aprovação está ligado) que o Órigo Agente executa. Use para chamados do GLPI. Informe colaborador_id OU terceiro_id e o motivo (número do chamado).",
  inputSchema: {
    colaborador_id: z.string().uuid().optional(),
    terceiro_id: z.string().uuid().optional(),
    conceder: z.array(recurso).optional().describe("Recursos/perfis a conceder"),
    revogar: z.array(recurso).optional().describe("Recursos/perfis a revogar"),
    motivo: z.string().min(3).describe("Justificativa — ex.: GLPI #12345"),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    if (!input.colaborador_id && !input.terceiro_id) return { content: [{ type: "text", text: "Informe colaborador_id ou terceiro_id" }], isError: true };
    const client = sb(ctx);
    const requestedBy = ctx.getUserEmail() ?? "hermes-agent";
    const ids = { p_colaborador_id: input.colaborador_id ?? null, p_terceiro_id: input.terceiro_id ?? null };
    const out: Record<string, unknown> = { enfileirados: 0, perfis_atribuidos: 0, perfis_revogados: 0 };
    const errors: string[] = [];

    const perfisAdd = (input.conceder ?? []).filter((r) => r.tipo === "perfil").map((r) => r.id);
    const perfisRem = (input.revogar ?? []).filter((r) => r.tipo === "perfil").map((r) => r.id);
    const toList = (rs: z.infer<typeof recurso>[]) => rs.filter((r) => r.tipo !== "perfil").map((r) => ({ tipo: r.tipo, id: r.id, pasta_id: r.pasta_id ?? null, permissao: r.permissao ?? null }));

    // perfis: materializa a atribuição e enfileira (assign) / revoga e enfileira só o que deixou de ser concedido
    for (const perfilId of perfisAdd) {
      const col = input.colaborador_id ? "colaborador_id" : "terceiro_id";
      const { data: existente } = await client.from("perfil_atribuicoes").select("id").eq(col, (input.colaborador_id ?? input.terceiro_id)!).eq("perfil_id", perfilId).eq("ativo", true).maybeSingle();
      if (!existente) {
        const { error } = await client.from("perfil_atribuicoes").insert({ [col]: input.colaborador_id ?? input.terceiro_id, perfil_id: perfilId, origem: "manual", ativo: true } as never);
        if (error) { errors.push(`perfil ${perfilId}: ${error.message}`); continue; }
      }
      const { data, error } = await client.rpc("iam_enqueue_profile_actions", { ...ids, p_perfil_ids: [perfilId], p_mode: "assign", p_requested_by: requestedBy, p_status: "pending", p_motivo: input.motivo });
      if (error) errors.push(`perfil ${perfilId}: ${error.message}`);
      else { out.enfileirados = (out.enfileirados as number) + Number(data ?? 0); out.perfis_atribuidos = (out.perfis_atribuidos as number) + 1; }
    }
    for (const perfilId of perfisRem) {
      const col = input.colaborador_id ? "colaborador_id" : "terceiro_id";
      const { error: e1 } = await client.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() } as never).eq(col, (input.colaborador_id ?? input.terceiro_id)!).eq("perfil_id", perfilId).eq("ativo", true);
      if (e1) { errors.push(`perfil ${perfilId}: ${e1.message}`); continue; }
      const { data, error } = await client.rpc("iam_enqueue_profile_actions", { ...ids, p_perfil_ids: [perfilId], p_mode: "remove", p_requested_by: requestedBy, p_status: "pending", p_motivo: input.motivo });
      if (error) errors.push(`perfil ${perfilId}: ${error.message}`);
      else { out.enfileirados = (out.enfileirados as number) + Number(data ?? 0); out.perfis_revogados = (out.perfis_revogados as number) + 1; }
    }

    // recursos individuais
    const added = toList(input.conceder ?? []);
    const removed = toList(input.revogar ?? []);
    if (added.length || removed.length) {
      const { data, error } = await client.rpc("iam_enqueue_resource_diff", {
        ...ids, p_added: added, p_removed: removed, p_requested_by: "manual_individual", p_status: "pending",
        p_motivo: input.motivo, p_exclude_perfil_ids: [], p_check_individual: false,
      });
      if (error) errors.push(`recursos: ${error.message}`);
      else out.enfileirados = (out.enfileirados as number) + Number(data ?? 0);
    }

    await client.from("auditoria").insert({
      acao: "request_access_mcp", entidade: input.colaborador_id ? "colaboradores" : "terceiros",
      entidade_id: input.colaborador_id ?? input.terceiro_id ?? null,
      resumo: `Solicitação de acesso via MCP (Hermes): ${(input.conceder ?? []).length} concessão(ões), ${(input.revogar ?? []).length} revogação(ões) — ${input.motivo}`,
      operador: requestedBy, detalhes: { input, result: out, errors },
    });
    const result = { ok: errors.length === 0, ...out, errors, observacao: "Itens executados pelo Órigo Agente após aprovação (se exigida). Acompanhe em list_iam_queue." };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: errors.length > 0 && (out.enfileirados as number) === 0 };
  },
});
