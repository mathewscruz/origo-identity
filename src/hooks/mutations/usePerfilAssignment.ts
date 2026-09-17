import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";

interface ColabIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
}

/**
 * Standardized assignment of a profile to a collaborator/identity.
 * Inserts perfil_atribuicoes + enqueues all profile resources, logs auditoria,
 * invalidates effective-access caches.
 */
export function useAssignPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ identity, perfilId, operadorEmail, origem = "manual" }: {
      identity: ColabIdentity;
      perfilId: string;
      operadorEmail?: string | null;
      origem?: string;
    }) => {
      const { error } = await supabase.from("perfil_atribuicoes").insert({
        perfil_id: perfilId,
        colaborador_id: identity.id,
        origem,
      });
      if (error) throw error;

      await queueFullProfileActions([identity], [perfilId], "assign");
      // auditoria: trigger perfil_atribuicoes_audit (operador = usuário logado)
      void operadorEmail;
      return { ok: true };
    },
    onSuccess: (_d, vars) => {
      toast.success("Perfil atribuído com sucesso");
      qc.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
      qc.invalidateQueries({ queryKey: ["effective-access", "colaborador", vars.identity.id] });
      qc.invalidateQueries({ queryKey: ["effective-access", "terceiro", vars.identity.id] });
    },
    onError: (err: any) => {
      toast.error("Erro ao atribuir perfil", { description: err?.message });
    },
  });
}

/**
 * Standardized revocation of a profile assignment.
 */
export function useRevokePerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ atribuicaoId, identity, perfilId, operadorEmail }: {
      atribuicaoId: string;
      identity: ColabIdentity;
      perfilId: string;
      operadorEmail?: string | null;
    }) => {
      const { error } = await supabase
        .from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() })
        .eq("id", atribuicaoId);
      if (error) throw error;

      await queueFullProfileActions([identity], [perfilId], "remove");
      // auditoria: trigger perfil_atribuicoes_audit (operador = usuário logado)
      void operadorEmail;
      return { ok: true };
    },
    onSuccess: (_d, vars) => {
      toast.success("Acesso revogado");
      qc.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
      qc.invalidateQueries({ queryKey: ["effective-access", "colaborador", vars.identity.id] });
      qc.invalidateQueries({ queryKey: ["effective-access", "terceiro", vars.identity.id] });
    },
    onError: (err: any) => {
      toast.error("Erro ao revogar perfil", { description: err?.message });
    },
  });
}
