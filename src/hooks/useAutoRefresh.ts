import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AutoRefreshTask =
  | "sync-entra-groups" | "sync-entra-apps" | "sync-entra-licencas" | "sync-entra-roles"
  | "sync-sharepoint-sites" | "sync-app-profiles" | "quarantine-triage" | "audit-reconciliation" | "sync-service-accounts";

export type AutoRefreshState = "loading" | "ok" | "waiting" | "error";

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Ao abrir a página, pede ao Hermes que atualize os dados (no máximo 1 vez a cada intervalo).
 * Nada é executado pelo navegador; o Hermes atende no próximo ciclo. Falhas não são escondidas.
 */
export function useAutoRefresh(tasks: AutoRefreshTask | AutoRefreshTask[], minIntervalMin = 15) {
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [state, setState] = useState<AutoRefreshState>("loading");
  const key = Array.isArray(tasks) ? tasks.join(",") : tasks;
  useEffect(() => {
    let alive = true;
    const list = key.split(",") as AutoRefreshTask[];
    // bind: chamar supabase.rpc solto perde o `this` e falhava em silêncio
    const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    (async () => {
      rpc("agent_offline_check").then(() => undefined, () => undefined);
      let newest: string | null = null;
      let waiting = false;
      for (const t of list) {
        const { data, error } = await rpc("agent_refresh_request", { p_task: t, p_min_interval_min: minIntervalMin });
        if (error) throw new Error(error.message);
        const d = (data ?? {}) as { last_at?: string | null; queued?: boolean; open?: boolean };
        if (d.queued || d.open) waiting = true;
        if (d.last_at && (!newest || d.last_at > newest)) newest = d.last_at;
      }
      if (alive) { setLastAt(newest); setState(waiting ? "waiting" : "ok"); }
    })().catch((e) => { console.error("[auto-refresh]", e); if (alive) setState("error"); });
    return () => { alive = false; };
  }, [key, minIntervalMin]);
  return { lastAt, state };
}
