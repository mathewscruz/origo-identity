import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RingTone } from "@/lib/revalidationRing";

const TONE: Record<RingTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
  muted: "stroke-sidebar-muted-foreground",
};

export function ProgressRing({ percent, tone, top, value, bottom, size = 132 }: {
  percent: number; tone: RingTone; top: string; value: string; bottom?: string; size?: number;
}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} className="stroke-sidebar-accent" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} className={cn("transition-all", TONE[tone])} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-sidebar-foreground">{top}</span>
        <span className="text-3xl font-semibold leading-tight text-sidebar-accent-foreground">{value}</span>
        {bottom && <span className="text-[11px] text-sidebar-foreground">{bottom}</span>}
      </div>
    </div>
  );
}

export default function IdentityHeader({ backTo, initials, nome, tag, subtitle, badges, actions, aside, compact }: {
  backTo?: string; initials: string; nome: string; tag: ReactNode; subtitle?: ReactNode;
  badges?: ReactNode; actions?: ReactNode; aside?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-sidebar text-sidebar-foreground", compact ? "p-4" : "p-6")}>
      <div className="flex flex-wrap items-center gap-5">
        {backTo && (
          <Link to={backTo} aria-label="Voltar" className="self-start rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 font-semibold text-sidebar-primary ring-2 ring-sidebar-primary/40",
          compact ? "h-14 w-14 text-lg" : "h-24 w-24 text-3xl")}>{initials}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className={cn("font-semibold tracking-tight text-sidebar-accent-foreground", compact ? "text-lg" : "text-3xl")}>{nome}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-sidebar-primary px-3 py-0.5 text-xs font-medium text-sidebar-primary-foreground">{tag}</span>
            {badges}
          </div>
          {subtitle && <div className="text-sm text-sidebar-foreground">{subtitle}</div>}
        </div>
        {aside && <div className="hidden border-l border-sidebar-border pl-6 md:block">{aside}</div>}
      </div>
      {actions && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-sidebar-border pt-4">{actions}</div>}
    </div>
  );
}
