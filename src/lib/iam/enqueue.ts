import { supabase } from "@/integrations/supabase/client";
import type { QueueIdentity, QueueRow } from "./queueTypes";

/**
 * Insert a strongly-typed batch of queue items into `iam_queue`.
 *
 * Each row inherits the requester identity (colaborador_id, target_identity,
 * requested_by) so callers only need to specify the action-specific payload.
 *
 * Returns the inserted row count, or throws on error.
 */
export async function enqueue(
  identity: QueueIdentity,
  rows: QueueRow[],
  options: { status?: "pending" | "processing"; reason?: string } = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const status = options.status ?? "pending";
  const inserts = rows.map((r) => ({
    action_type: r.action_type,
    colaborador_id: identity.colaboradorId,
    target_identity: identity.targetIdentity,
    requested_by: identity.requestedBy,
    status,
    payload_json: options.reason
      ? { ...(r.payload_json as any), reason: (r.payload_json as any).reason ?? options.reason }
      : r.payload_json,
  }));
  const { error, count } = await (supabase as any)
    .from("iam_queue")
    .insert(inserts, { count: "exact" });
  if (error) throw error;
  return count ?? inserts.length;
}
