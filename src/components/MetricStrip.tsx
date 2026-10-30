import { cn } from "@/lib/utils";

export interface MetricItem {
  label: string;
  value: number | string;
  tone?: "primary" | "default" | "danger" | "warning";
  active?: boolean;
  onClick?: () => void;
}

const TONE: Record<string, string> = {
  primary: "text-primary",
  default: "text-foreground",
  danger: "text-destructive",
  warning: "text-warning",
};

/** Faixa compacta de números com divisórias; cada item pode filtrar a lista. */
export default function MetricStrip({ items, right }: { items: MetricItem[]; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-6 py-4">
      <div className="flex flex-wrap items-center divide-x divide-border">
        {items.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={m.onClick}
            disabled={!m.onClick}
            className={cn(
              "flex flex-col items-center px-6 first:pl-0 text-center transition-opacity disabled:cursor-default",
              m.onClick && "hover:opacity-80",
            )}
          >
            <span className={cn("text-2xl font-semibold tabular-nums leading-tight", TONE[m.tone ?? "default"])}>
              {typeof m.value === "number" ? m.value.toLocaleString("pt-BR") : m.value}
            </span>
            <span className={cn("text-sm text-muted-foreground", m.active && "font-medium text-primary underline underline-offset-4")}>{m.label}</span>
          </button>
        ))}
      </div>
      {right}
    </div>
  );
}
