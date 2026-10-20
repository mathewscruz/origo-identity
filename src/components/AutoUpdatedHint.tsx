import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAutoRefresh, type AutoRefreshTask } from "@/hooks/useAutoRefresh";

/** Pede atualização automática ao Hermes e mostra discretamente quando foi a última. */
export function AutoUpdatedHint({ tasks }: { tasks: AutoRefreshTask | AutoRefreshTask[] }) {
  const { lastAt } = useAutoRefresh(tasks);
  return (
    <span className="text-xs text-muted-foreground">
      {lastAt ? `Atualizado automaticamente ${formatDistanceToNow(new Date(lastAt), { addSuffix: true, locale: ptBR })}` : "Atualização automática solicitada"}
    </span>
  );
}
