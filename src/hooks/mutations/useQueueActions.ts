import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ações sobre itens da fila IAM — todas via RPC, para que a máquina de estados,
 * a anti-auto-aprovação e a auditoria sejam aplicadas no banco. A execução em si
 * é sempre do Órigo Agente.
 */

/** Reenvia um item `failed` para execução (RPC iam_queue_reprocessar). */
export function useReprocessQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { data, error } = await supabase.rpc("iam_queue_reprocessar", { p_ids: [queueId] });
      if (error) throw error;
      if (!data) throw new Error("Item não está em 'failed' — só itens com falha podem ser reprocessados.");
    },
    onSuccess: () => {
      toast.success("Item devolvido à fila do agente");
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("iam_queue") });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao reprocessar item", { description: err instanceof Error ? err.message : String(err) });
    },
  });
}

/** Cancela um item aberto (pending/waiting_approval) — RPC iam_queue_decidir('cancel'). */
export function useCancelQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { queueId: string; motivo?: string }) => {
      const queueId = typeof input === "string" ? input : input.queueId;
      const motivo = typeof input === "string" ? null : input.motivo ?? null;
      const { error } = await supabase.rpc("iam_queue_decidir", { p_ids: [queueId], p_decisao: "cancel", p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item cancelado");
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("iam_queue") });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao cancelar item", { description: err instanceof Error ? err.message : String(err) });
    },
  });
}
