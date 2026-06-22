import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuditoria } from "@/lib/auditLogger";

type JmlStatus = "pendente" | "quarentena" | "executando" | "executado" | "erro" | "cancelado";

interface UpdateStatusParams {
  eventoId: string;
  status: JmlStatus;
  resetTentativas?: boolean;
}

export function useUpdateJmlStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventoId, status, resetTentativas }: UpdateStatusParams) => {
      const patch: Record<string, unknown> = { status };
      if (resetTentativas) patch.tentativas = 0;
      const { error } = await (supabase as any).from("eventos_jml").update(patch).eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const labels: Record<JmlStatus, string> = {
        pendente: "Evento marcado como pendente",
        quarentena: "Evento movido para quarentena",
        executando: "Evento aprovado e em execução",
        executado: "Evento marcado como executado",
        erro: "Evento marcado como erro",
        cancelado: "Evento cancelado",
      };
      toast.success(labels[vars.status]);
      await logAuditoria({
        acao: `evento_jml_${vars.status}`,
        entidade: "eventos_jml",
        entidade_id: vars.eventoId,
      });
      qc.invalidateQueries({ queryKey: ["evento_jml", vars.eventoId] });
      qc.invalidateQueries({ queryKey: ["eventos_jml"] });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao atualizar evento JML", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
