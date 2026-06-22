import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuditoria } from "@/lib/auditLogger";

interface ToggleParams {
  colaboradorId: string;
  nome: string;
  ativar: boolean;
}

/** Marks a collaborator active/inactive. Lifecycle side effects (queueing, JML event)
 *  remain in colaboradorLifecycle.ts — this hook only flips the DB flag + audit + toast. */
export function useColabActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ colaboradorId, ativar }: ToggleParams) => {
      const { error } = await supabase
        .from("colaboradores")
        .update({ status: ativar ? "ativo" : "inativo" } as any)
        .eq("id", colaboradorId);
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      await logAuditoria({
        acao: vars.ativar ? "ativar_colaborador" : "desativar_colaborador",
        entidade: "colaboradores",
        entidade_id: vars.colaboradorId,
        resumo: `${vars.ativar ? "Ativado" : "Desativado"}: ${vars.nome}`,
      });
      toast.success(vars.ativar ? "Colaborador ativado" : "Colaborador desativado");
      qc.invalidateQueries({ queryKey: ["colaborador", vars.colaboradorId] });
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (err: unknown) => {
      toast.error("Erro ao atualizar colaborador", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
