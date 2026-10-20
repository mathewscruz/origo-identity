import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAutoRefresh, type AutoRefreshTask } from "@/hooks/useAutoRefresh";

/** Pede atualização automática ao Hermes e mostra discretamente o estado real. */
export function AutoUpdatedHint({ tasks }: { tasks: AutoRefreshTask | AutoRefreshTask[] }) {
  const { lastAt, state } = useAutoRefresh(tasks);
  if (state === "error") return <span className="text-xs text-destructive">Não foi possível pedir atualização ao Hermes</span>;
  const when = lastAt ? `Atualizado ${formatDistanceToNow(new Date(lastAt), { addSuffix: true, locale: ptBR })}` : null;
  const text = state === "loading" ? "Verificando atualização…"
    : state === "waiting" ? (when ? `${when} · aguardando o Hermes atualizar` : "Aguardando o Hermes atualizar")
    : when ?? "Atualizado";
  return <span className="text-xs text-muted-foreground">{text}</span>;
}
