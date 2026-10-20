import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AutoRefreshTask =
  | "sync-entra-groups" | "sync-entra-apps" | "sync-entra-licencas" | "sync-entra-roles"
  | "sync-sharepoint-sites" | "sync-app-profiles" | "quarantine-triage" | "audit-reconciliation";

/**
 * Ao abrir a página, pede ao Hermes que atualize os dados (no máximo 1 vez a cada intervalo).
 * Nada é executado pelo navegador; o Hermes atende no próximo ciclo.
 */
export function useAutoRefresh(tasks: AutoRefreshTask | AutoRefreshTask[], minIntervalMin = 15) {
  const [lastAt, setLastAt] = useState<string | null>(null);
  const key = Array.isArray(tasks) ? tasks.join(",") : tasks;
  useEffect(() => {
    let alive = true;
    const list = key.split(",") as AutoRefreshTask[];
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpc = supabase.rpc as any;
      rpc("agent_offline_check").then(() => undefined, () => undefined);
      let newest: string | null = null;
      for (const t of list) {
        const { data } = await rpc("agent_refresh_request", { p_task: t, p_min_interval_min: minIntervalMin });
        const at = (data as { last_at?: string } | null)?.last_at ?? null;
        if (at && (!newest || at > newest)) newest = at;
      }
      if (alive) setLastAt(newest);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [key, minIntervalMin]);
  return { lastAt };
}
