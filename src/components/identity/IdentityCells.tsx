import { cn } from "@/lib/utils";
import { daysUntil, revalidationTone, type RingTone } from "@/lib/revalidationRing";

export function initialsOf(nome?: string | null) {
  return String(nome ?? "?").split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function IdentityAvatar({ nome, className }: { nome?: string | null; className?: string }) {
  return <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary", className)}>{initialsOf(nome)}</span>;
}

const STROKE: Record<RingTone, string> = { success: "stroke-success", warning: "stroke-warning", destructive: "stroke-destructive", muted: "stroke-muted-foreground" };
const TEXT: Record<RingTone, string> = { success: "text-success", warning: "text-warning", destructive: "text-destructive", muted: "text-muted-foreground" };

/** Mini-anel de revalidação para tabelas (mesma regra de cores da ficha). */
export function RevalidationMini({ base, ciclo }: { base?: string | null; ciclo: number }) {
  const prox = base ? new Date(new Date(base).getTime() + ciclo * 86_400_000) : null;
  const dias = daysUntil(prox);
  const tone = revalidationTone(dias);
  const pct = dias === null ? 0 : Math.max(0, Math.min(1, dias / ciclo));
  const r = 9, c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={22} height={22} className="-rotate-90"><circle cx={11} cy={11} r={r} fill="none" strokeWidth={3} className="stroke-muted" /><circle cx={11} cy={11} r={r} fill="none" strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className={STROKE[tone]} /></svg>
      <span className={cn("text-xs font-medium", TEXT[tone])}>{dias === null ? "—" : dias < 0 ? `vencida há ${-dias}d` : `${dias}d`}</span>
    </span>
  );
}
