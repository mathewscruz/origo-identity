import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { useAutoRefresh, type AutoRefreshTask } from "@/hooks/useAutoRefresh";

/** Pede atualização automática ao Hermes e mostra discretamente o estado real. */
export function AutoUpdatedHint({ tasks }: { tasks: AutoRefreshTask | AutoRefreshTask[] }) {
  const { lastAt, state } = useAutoRefresh(tasks);
  if (state === "error") return <span className="text-xs text-destructive">Não foi possível pedir atualização ao Hermes</span>;
  if (state === "loading" || state === "waiting") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <Loader2 className="h-3 w-3 animate-spin" />{state === "loading" ? "Verificando atualização…" : "Hermes atualizando…"}
    </span>
  );
  const when = lastAt ? `Atualizado ${formatDistanceToNow(new Date(lastAt), { addSuffix: true, locale: ptBR })}` : "Atualizado";
  return <span className="text-xs text-muted-foreground">{when}</span>;
}
