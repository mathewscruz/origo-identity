import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Reset a queue item to pending so the processor picks it up again. */
export function useReprocessQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { error } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "pending", error_code: null, result_message: null, next_retry_at: null, retry_count: 0 })
        .eq("id", queueId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item reenviado para processamento");
      qc.invalidateQueries({ queryKey: ["iam_queue"] });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao reprocessar item", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

/** Mark a queue item as cancelled (won't be retried). */
export function useCancelQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { error } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "cancelled" })
        .eq("id", queueId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item cancelado");
      qc.invalidateQueries({ queryKey: ["iam_queue"] });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao cancelar item", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

/** Bulk-reprocess every non-final item for an identity (used by JML event detail). */
export function useReprocessQueueForIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (colaboradorId: string) => {
      const { error, count } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "pending", error_code: null, result_message: null, next_retry_at: null, retry_count: 0 }, { count: "exact" })
        .eq("colaborador_id", colaboradorId)
        .in("status", ["failed", "permanent_failure"]);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} item(ns) reenviado(s) para processamento`);
      qc.invalidateQueries({ queryKey: ["iam_queue"] });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao reprocessar fila", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
