import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const key = Array.isArray(tasks) ? tasks.join(",") : tasks;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    const list = key.split(",") as AutoRefreshTask[];
    // bind: chamar supabase.rpc solto perde o `this` e falhava em silêncio
    const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
    const checkCompletion = async () => {
      if (polling) return;
      polling = true;
      try {
        const latest = await Promise.all(list.map(async (task) => {
          const { data, error } = await supabase.from("agent_tasks")
            .select("status,finished_at").eq("task", task)
            .order("created_at", { ascending: false }).limit(1);
          if (error) throw error;
          return data?.[0];
        }));
        if (!alive || latest.some((row) => !row || row.status === "pending" || row.status === "running")) return;
        if (timer) clearInterval(timer);
        if (latest.some((row) => row?.status !== "done")) { setState("error"); return; }
        const newest = latest.reduce<string | null>((at, row) => row?.finished_at && (!at || row.finished_at > at) ? row.finished_at : at, null);
        if (newest) setLastAt(newest);
        setState("ok");
        if (list.includes("quarantine-triage")) qc.invalidateQueries({ queryKey: ["colab_quarentena"] });
      } catch (e) {
        console.error("[auto-refresh]", e);
        if (alive) { if (timer) clearInterval(timer); setState("error"); }
      } finally { polling = false; }
    };
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
      if (!alive) return;
      setLastAt(newest);
      setState(waiting ? "waiting" : "ok");
      if (waiting) timer = setInterval(checkCompletion, 4000);
    })().catch((e) => { console.error("[auto-refresh]", e); if (alive) setState("error"); });
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [key, minIntervalMin, qc]);
  return { lastAt, state };
}
