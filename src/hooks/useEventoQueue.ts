import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns iam_queue rows that belong to a given JML event, correlated by
 * colaborador_id and a time window around the event creation. We don't have a
 * direct FK yet, so we use a ±5 minute window (events typically enqueue all
 * actions in a single transaction).
 */
export function useEventoQueue(eventoId?: string, colaboradorId?: string, createdAt?: string) {
  return useQuery({
    queryKey: ["evento_queue", eventoId],
    enabled: !!eventoId && !!colaboradorId && !!createdAt,
    queryFn: async () => {
      const base = new Date(createdAt!);
      const from = new Date(base.getTime() - 5 * 60_000).toISOString();
      const to = new Date(base.getTime() + 30 * 60_000).toISOString();
      const { data, error } = await (supabase as any)
        .from("iam_queue")
        .select("id, action_type, status, payload_json, target_identity, created_at, processed_at, error_code, result_message, retry_count")
        .eq("colaborador_id", colaboradorId!)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
