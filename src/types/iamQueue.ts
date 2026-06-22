/**
 * Strong typing for `iam_queue.payload_json` payloads.
 *
 * Backend remains permissive (jsonb), but the frontend uses these
 * discriminated unions to safely read/write queue items.
 */

export const QUEUE_STATUS = ["pending", "processing", "success", "failed"] as const;
export type QueueStatus = (typeof QUEUE_STATUS)[number];

export const ACTION_TYPES = [
  // AD / lifecycle
  "create",
  "create_if_not_exists",
  "update",
  "disable",
  "delete",
  // Entra ID
  "enable_entra",
  "disable_entra",
  "update_entra",
  // Group/license/app provisioning
  "assign_group",
  "remove_group",
  "assign_license",
  "remove_license",
  "assign_app",
  "remove_app",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

// ─── Payload shapes ─────────────────────────────────────────────

export interface BaseIdentityPayload {
  mail?: string | null;
  samAccountName?: string | null;
  displayName?: string | null;
}

export interface CreateUserPayload extends BaseIdentityPayload {
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  company?: string;
  usageLocation?: string;
  password?: string;
  changePasswordAtLogon?: boolean;
}

export interface UpdateUserPayload extends BaseIdentityPayload {
  jobTitle?: string;
  department?: string;
  company?: string;
  status_anterior?: string;
  status_novo?: string;
  changed_fields?: string[];
  new_values?: Record<string, unknown>;
}

export interface GroupAssignmentPayload extends BaseIdentityPayload {
  groupId: string;
  groupName?: string;
  groupOrigin?: "cloud" | "on_premise";
}

export interface LicenseAssignmentPayload extends BaseIdentityPayload {
  skuId: string;
  skuName?: string;
}

export interface AppAssignmentPayload extends BaseIdentityPayload {
  appId: string;
  appName?: string;
  appRoleId?: string;
}

export type QueuePayload =
  | ({ action_type: "create" | "create_if_not_exists" } & CreateUserPayload)
  | ({ action_type: "update" | "update_entra" } & UpdateUserPayload)
  | ({ action_type: "disable" | "delete" | "enable_entra" | "disable_entra" } & BaseIdentityPayload)
  | ({ action_type: "assign_group" | "remove_group" } & GroupAssignmentPayload)
  | ({ action_type: "assign_license" | "remove_license" } & LicenseAssignmentPayload)
  | ({ action_type: "assign_app" | "remove_app" } & AppAssignmentPayload);

export interface IamQueueItem {
  id: string;
  action_type: ActionType;
  status: QueueStatus;
  payload_json: Record<string, unknown>;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
  result_message: string | null;
  correlation_id: string | null;
  colaborador_id: string | null;
  target_identity: string | null;
  retry_count: number;
  max_retries: number;
}

// ─── Helpers ────────────────────────────────────────────────────

export function isAssignAction(a: ActionType): boolean {
  return a.startsWith("assign_");
}

export function isRemoveAction(a: ActionType): boolean {
  return a.startsWith("remove_") || a === "disable" || a === "disable_entra" || a === "delete";
}

export function actionResource(a: ActionType): "group" | "license" | "app" | "user" | null {
  if (a.endsWith("_group")) return "group";
  if (a.endsWith("_license")) return "license";
  if (a.endsWith("_app")) return "app";
  if (["create", "create_if_not_exists", "update", "disable", "delete", "enable_entra", "disable_entra", "update_entra"].includes(a)) return "user";
  return null;
}
