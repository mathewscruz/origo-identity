/**
 * Returns a friendly area name. If the stored name is empty or purely numeric
 * (legacy CSV codes like "30216"), returns "—" so the UI doesn't expose raw codes.
 */
export function formatAreaName(name: string | null | undefined): string {
  if (!name) return "—";
  const trimmed = String(name).trim();
  if (!trimmed) return "—";
  if (/^\d+$/.test(trimmed)) return "—";
  return trimmed;
}
