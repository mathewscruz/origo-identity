import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export type SkeletonVariant = "table" | "cards" | "chart" | "panel" | "list";

/** Esqueleto animado no formato do conteúdo que está carregando. */
export function LoadingSkeleton({ variant = "table", rows = 6 }: { variant?: SkeletonVariant; rows?: number }) {
  const label = <span className="sr-only">Carregando dados…</span>;
  if (variant === "cards") return (
    <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{label}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-lg" /><Skeleton className="h-4 w-1/2" /></div>
          <Skeleton className="h-3 w-full" /><Skeleton className="h-2 w-3/4" />
        </div>
      ))}
    </div>
  );
  if (variant === "chart") return (
    <div role="status" className="flex h-48 items-end gap-2 p-4">{label}
      {Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="flex-1" style={{ height: `${25 + ((i * 37) % 70)}%` }} />)}
    </div>
  );
  if (variant === "panel") return (
    <div role="status" className="space-y-4 p-4">{label}
      <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );
  return (
    <div role="status" className="space-y-2 p-4">{label}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Linhas de esqueleto dentro de uma tabela existente. */
export function TableSkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return <>{Array.from({ length: rows }).map((_, r) => (
    <TableRow key={r}>{Array.from({ length: cols }).map((_, c) => <TableCell key={c}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
  ))}</>;
}
