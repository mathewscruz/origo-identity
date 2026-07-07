import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilesResources, type ProfileResources } from "@/lib/iam/resolveProfileResources";

export interface EffectiveAccess extends ProfileResources {
  perfilIds: string[];
  /** Individual (non-profile) assignments still living in iam_queue with status success. */
  individuals: {
    action_type: "assign_group" | "assign_license" | "assign_app" | "assign_sharepoint";
    payload_json: any;
    target_identity: string;
  }[];
}

/**
 * Returns the *effective* access of a single identity (colab or terceiro):
 * merged resources from all active perfis + individual `iam_queue` assignments.
 *
 * Backs admin views (ColaboradorDetalhe / TerceiroDetalhe), recertification
 * snapshots, SoD computations, and the portal catalog.
 */
export function useEffectiveAccess(identityId: string | null | undefined) {
  return useQuery<EffectiveAccess>({
    queryKey: ["effective_access", identityId],
    enabled: !!identityId,
    queryFn: async () => {
      const { data: atribs } = await supabase
        .from("perfil_atribuicoes")
        .select("perfil_id")
        .or(`colaborador_id.eq.${identityId},terceiro_id.eq.${identityId}`)
        .eq("ativo", true);
      const perfilIds = (atribs ?? []).map((a: any) => a.perfil_id).filter(Boolean);

      const profileBundle = await resolveProfilesResources(perfilIds);

      const { data: individuals } = await (supabase as any)
        .from("iam_queue")
        .select("action_type, payload_json, target_identity")
        .eq("colaborador_id", identityId)
        .eq("requested_by", "manual_individual")
        .eq("status", "success")
        .in("action_type", ["assign_group", "assign_license", "assign_app", "assign_sharepoint"]);

      return {
        ...profileBundle,
        perfilIds,
        individuals: (individuals ?? []) as EffectiveAccess["individuals"],
      };
    },
    staleTime: 15_000,
  });
}
