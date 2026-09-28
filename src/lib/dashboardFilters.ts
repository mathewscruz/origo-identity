export function completedQueueLink(reference = new Date().toISOString()) {
  const from = new Date(new Date(reference).getTime() - 7 * 86400000).toISOString();
  return `/fila-provisionamento?status=success&processed_from=${encodeURIComponent(from)}`;
}
export function queueStatuses(key: string): string[] {
  return key === "agente" ? ["pending", "processing"] : [key];
}
export function isPreventivelySuspended(row: { suspenso_preventivo?: boolean | null; status?: string }) {
  return row.suspenso_preventivo === true;
}
