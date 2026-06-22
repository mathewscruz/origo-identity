import { supabase } from "@/integrations/supabase/client";

/**
 * Enfileira o provisionamento de um item de solicitação na iam_queue.
 * Funciona para tipo "app", "grupo" ou "licenca".
 *
 * Mantém o mesmo contrato (camelCase) usado em todo o app.
 */
export async function enqueueItemProvisioning(
  item: { tipo: "app" | "grupo" | "licenca"; recurso_id: string; recurso_nome: string },
  colab: { id: string; entra_id?: string | null; email?: string | null; sam_account_name?: string | null },
  resources: {
    appMap?: Map<string, any>;
    grupoMap?: Map<string, any>;
    licencaMap?: Map<string, any>;
  },
  requestedBy: string,
) {
  const targetIdentity = colab.entra_id || colab.email || colab.sam_account_name;
  if (!targetIdentity) return;

  const actionMap: Record<string, string> = {
    app: "assign_app",
    grupo: "assign_group",
    licenca: "assign_license",
  };
  const keyMap: Record<string, { id: string; name: string }> = {
    app: { id: "appId", name: "appName" },
    grupo: { id: "groupId", name: "groupName" },
    licenca: { id: "skuId", name: "licenseName" },
  };

  const keys = keyMap[item.tipo];
  let resourceExternalId = item.recurso_id;
  if (item.tipo === "app") resourceExternalId = resources.appMap?.get(item.recurso_id)?.entra_id || item.recurso_id;
  if (item.tipo === "grupo") resourceExternalId = resources.grupoMap?.get(item.recurso_id)?.entra_id || item.recurso_id;
  if (item.tipo === "licenca") resourceExternalId = resources.licencaMap?.get(item.recurso_id)?.sku_id || item.recurso_id;

  const payload: Record<string, any> = {
    [keys.id]: resourceExternalId,
    [keys.name]: item.recurso_nome,
    reason: "solicitacao_acesso",
  };
  if (item.tipo === "app") {
    const app = resources.appMap?.get(item.recurso_id);
    if (app?.default_app_role_id) payload.appRoleId = app.default_app_role_id;
  }

  await supabase.from("iam_queue").insert({
    action_type: actionMap[item.tipo],
    colaborador_id: colab.id,
    target_identity: targetIdentity,
    status: "pending",
    payload_json: payload,
    requested_by: requestedBy,
  } as any);
}
