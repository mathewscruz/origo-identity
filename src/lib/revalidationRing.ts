export type RingTone = "success" | "warning" | "destructive" | "muted";

/** Cor do anel de revalidação: vencida = vermelho; até 15 dias = amarelo; acima = verde. */
export function revalidationTone(dias: number | null): RingTone {
  if (dias === null || !Number.isFinite(dias)) return "muted";
  if (dias < 0) return "destructive";
  if (dias <= 15) return "warning";
  return "success";
}

export function daysUntil(date: Date | null, now = Date.now()): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now) / 86_400_000);
}
