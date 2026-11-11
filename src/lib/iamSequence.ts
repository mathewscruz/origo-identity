/**
 * Ordem fixa dos passos de criação (1–7) e desativação (8–13) de usuários.
 * Espelha a função `iam_step_order` no banco, que é quem de fato aplica a ordem.
 */
export const IAM_STEP_ORDER: Record<string, number> = {
  create: 1, create_if_not_exists: 1,
  replicate_entra: 2,
  assign_license: 3,
  assign_group: 4,
  assign_app: 5, assign_sharepoint: 5, create_user_app: 5,
  enable_litigation_hold: 6,
  send_password_teams: 7,
  disable_entra: 8,
  disable: 9,
  remove_license: 10,
  remove_group: 11,
  remove_app: 12, remove_sharepoint: 12, disable_user_app: 12,
  reply_ticket: 13,
};

export const JOINER_STEPS = ["Criar no AD", "Replicar no Entra", "Licença", "Grupos", "Apps", "Litigation Hold", "Senha pelo Teams"] as const;
export const LEAVER_STEPS = ["Desativar Entra", "Desativar AD", "Remover licença", "Remover grupos", "Remover apps", "Responder chamado"] as const;

export function stepOrder(action: string): number | null {
  return IAM_STEP_ORDER[action] ?? null;
}

const OPEN = new Set(["pending", "processing", "waiting_approval", "failed"]);

/** Um passo só pode rodar quando nenhum passo anterior do mesmo fluxo está em aberto ou falhou. */
export function isBlocked(action: string, siblings: { action_type: string; status: string }[]): boolean {
  const n = stepOrder(action);
  if (n == null) return false;
  const joiner = n <= 7;
  return siblings.some((s) => {
    const m = stepOrder(s.action_type);
    return m != null && m < n && (m <= 7) === joiner && OPEN.has(s.status);
  });
}

const NOT_REMOVABLE = /(dynamic|din[aâ]mic|insufficient privileges|authorization_requestdenied|on-?premises|synced|mail-enabled|cannot update|not removable|group_not_removable)/i;

/** Falha ao remover grupo que não pode ser removido não é falha: o desligamento segue. */
export function isGroupNotRemovable(item: { message?: string | null; errorCode?: string | null; dynamicMembership?: boolean }): boolean {
  if (item.dynamicMembership) return true;
  return NOT_REMOVABLE.test(`${item.message ?? ""} ${item.errorCode ?? ""}`);
}

/** A senha vai para quem abriu o chamado; sem chamado, para o gestor. */
export function passwordRecipient(requestedBy: string | null | undefined, managerEmail: string | null | undefined): string | null {
  if (requestedBy && requestedBy.includes("@")) return requestedBy;
  return managerEmail || null;
}
