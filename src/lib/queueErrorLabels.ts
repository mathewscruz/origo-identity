/** Explicação em português dos códigos de resultado gravados pelo Hermes na fila. */
export const QUEUE_ERROR_LABELS: Record<string, string> = {
  unsupported_ad_action: "Ação de AD não suportada pelo agente",
  ad_ldap_not_configured: "Conexão com o AD indisponível",
  graph_http_error: "Erro no Microsoft Graph",
  policy_no_ad_mutation: "Política: sem alteração no AD",
  user_not_in_entra_noop: "Usuário não existe no Entra — nada a fazer",
  license_mutually_exclusive_policy_conflict: "Conflito de licenças (mutuamente exclusivas)",
  historical_registry_only_update: "Histórico: apenas atualização de cadastro",
  iam_cadastral_update_no_external_mutation: "Atualização só de cadastro, sem mudança nos diretórios",
  historical_converged_ad_live: "Já estava correto no AD",
  historical_converged_license_absent: "Licença já não existia",
  historical_superseded: "Substituído por um pedido mais recente",
  dry_run: "Simulação (nada foi alterado)",
  reconcile_ghost: "Usuário inexistente nos diretórios",
};

export function queueErrorLabel(code?: string | null): string | null {
  if (!code) return null;
  return QUEUE_ERROR_LABELS[code] ?? code;
}
