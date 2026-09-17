import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type StatTone = "default" | "primary" | "success" | "warning" | "destructive" | "info";

const TONES: Record<StatTone, { icon: string; ring: string }> = {
  default: { icon: "bg-muted text-muted-foreground", ring: "" },
  primary: { icon: "bg-primary/10 text-primary", ring: "hover:border-primary/40" },
  success: { icon: "bg-success/10 text-success", ring: "hover:border-success/40" },
  warning: { icon: "bg-warning/10 text-warning", ring: "hover:border-warning/40" },
  destructive: { icon: "bg-destructive/10 text-destructive", ring: "hover:border-destructive/40" },
  info: { icon: "bg-info/10 text-info", ring: "hover:border-info/40" },
};

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  className?: string;
}

/** Cartão numérico padrão (KPI / contador de filtro). */
export default function StatCard({ label, value, hint, icon: Icon, tone = "default", to, onClick, active, loading, className = "" }: Props) {
  const t = TONES[tone];
  const interactive = !!(to || onClick);
  const body = (
    <Card className={`h-full transition-all duration-200 ${interactive ? `cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${t.ring}` : ""} ${active ? "border-primary ring-1 ring-primary/30" : ""} ${className}`} onClick={onClick}>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] font-medium uppercase leading-tight tracking-wider text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="text-2xl font-bold leading-tight tracking-tight tabular-nums">{value}</p>}
          {hint && <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
        </div>
        {to && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to} className="group block h-full">{body}</Link>;
  return body;
}
