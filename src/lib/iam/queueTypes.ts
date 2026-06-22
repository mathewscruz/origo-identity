/**
 * Discriminated union of all `iam_queue.action_type` payload shapes.
 *
 * Use these instead of `Record<string, any>` whenever you build a row that will be
 * inserted into `iam_queue`. This prevents typos like `groupID` vs `groupId` and
 * keeps the camelCase contract with `process-iam-queue` enforced at compile-time.
 *
 * NOTE: the queue's payload column is `jsonb`, so cast to `any` only at the
 * insert site — not when constructing the payload.
 */

export type QueueIdentity = {
  /** Internal colaborador / terceiro id. */
  colaboradorId: string;
  /** Best identifier for downstream provisioning: entra_id ?? email ?? samAccountName. */
  targetIdentity: string;
  requestedBy: string;
};

// ===== Account lifecycle =====
export interface CreateAccountPayload {
  samAccountName: string;
  mail: string | null;
  displayName: string;
  givenName?: string;
  surname?: string;
  password?: string;
  changePasswordAtLogon?: boolean;
}
export interface UpdateAccountPayload {
  samAccountName: string;
  mail: string | null;
  displayName: string;
  status?: "enabled" | "disabled";
}
export interface DisableAccountPayload {
  samAccountName: string;
  mail: string | null;
  displayName: string;
  status: "disabled";
}
export interface EnableEntraPayload {
  mail: string | null;
  samAccountName: string;
  displayName: string;
}
export interface ResetPasswordPayload {
  samAccountName: string;
  mail: string | null;
  newPassword?: string;
  forceChange?: boolean;
}

// ===== Group / app / license assignments =====
export interface GroupAssignmentPayload {
  groupId: string;
  groupName: string;
  reason?: string;
}
export interface LicenseAssignmentPayload {
  skuId: string;
  licenseName: string;
  reason?: string;
}
export interface AppAssignmentPayload {
  appId: string;
  appName: string;
  appRoleId?: string;
  reason?: string;
}

export type QueueRow =
  | { action_type: "create" | "create_if_not_exists"; payload_json: CreateAccountPayload }
  | { action_type: "update"; payload_json: UpdateAccountPayload }
  | { action_type: "disable"; payload_json: DisableAccountPayload }
  | { action_type: "disable_entra"; payload_json: UpdateAccountPayload }
  | { action_type: "enable_entra"; payload_json: EnableEntraPayload }
  | { action_type: "reset_password"; payload_json: ResetPasswordPayload }
  | { action_type: "assign_group" | "remove_group"; payload_json: GroupAssignmentPayload }
  | { action_type: "assign_license" | "remove_license"; payload_json: LicenseAssignmentPayload }
  | { action_type: "assign_app" | "remove_app"; payload_json: AppAssignmentPayload };

export type ActionType = QueueRow["action_type"];

/** Reverse action mapping, useful for revocations. */
export const REVERSE_ACTION: Partial<Record<ActionType, ActionType>> = {
  assign_group: "remove_group",
  remove_group: "assign_group",
  assign_license: "remove_license",
  remove_license: "assign_license",
  assign_app: "remove_app",
  remove_app: "assign_app",
  enable_entra: "disable_entra",
  disable_entra: "enable_entra",
};
