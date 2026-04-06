import { supabase } from "@/integrations/supabase/client";

/**
 * Provisions access profiles for a collaborator based on their cargo.
 * - Revokes old cargo-based assignments (origem='cargo')
 * - Creates new assignments for the new cargo's profiles
 * - Generates iam_queue entries for Entra ID group/license assignments
 */
export async function provisionCargoAcessos(
  colaboradorId: string,
  newCargoId: string | null,
  oldCargoId: string | null
): Promise<{ provisioned: number; revoked: number }> {
  let revoked = 0;
  let provisioned = 0;

  // Get colaborador sam_account_name for iam_queue
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("nome, email, sam_account_name")
    .eq("id", colaboradorId)
    .single();
  const sam = (colab as any)?.sam_account_name || "";

  // Revoke old cargo-based assignments
  if (oldCargoId) {
    // Get profiles being revoked to generate iam_queue entries
    const { data: activeAssignments } = await supabase
      .from("perfil_atribuicoes")
      .select("perfil_id")
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true);

    if (activeAssignments && activeAssignments.length > 0 && sam) {
      // Get groups and licenses for revoked profiles
      for (const assignment of activeAssignments) {
        await queueProfileAccess(sam, colab?.nome || "", colab?.email || "", assignment.perfil_id, "remove");
      }
    }

    const { data: revokedData } = await supabase
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true)
      .select("id");
    revoked = revokedData?.length || 0;
  }

  // Get new cargo's profiles
  if (newCargoId) {
    const { data: cargoPerfis } = await (supabase as any)
      .from("cargo_perfis")
      .select("perfil_id")
      .eq("cargo_id", newCargoId);

    if (cargoPerfis && cargoPerfis.length > 0) {
      const inserts = cargoPerfis.map((cp: any) => ({
        perfil_id: cp.perfil_id,
        colaborador_id: colaboradorId,
        origem: "cargo",
        ativo: true,
      }));

      const { data: inserted } = await supabase
        .from("perfil_atribuicoes")
        .insert(inserts)
        .select("id");
      provisioned = inserted?.length || 0;

      // Generate iam_queue for Entra ID provisioning
      if (sam) {
        for (const cp of cargoPerfis) {
          await queueProfileAccess(sam, colab?.nome || "", colab?.email || "", cp.perfil_id, "add");
        }
      }
    }
  }

  return { provisioned, revoked };
}

/**
 * Queue Entra ID group/license assignments for a profile
 */
async function queueProfileAccess(
  samAccountName: string,
  displayName: string,
  mail: string,
  perfilId: string,
  action: "add" | "remove"
) {
  // Get groups linked to this profile
  const { data: grupos } = await (supabase as any)
    .from("perfil_grupos")
    .select("grupo_id, entra_grupos(entra_id, nome)")
    .eq("perfil_id", perfilId);

  if (grupos) {
    for (const g of grupos) {
      if (!g.entra_grupos) continue;
      await supabase.from("iam_queue" as any).insert({
        action_type: action === "add" ? "assign_group" : "remove_group",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          groupId: g.entra_grupos.entra_id,
          groupName: g.entra_grupos.nome,
          action,
        },
        target_identity: samAccountName,
        requested_by: "sistema",
        status: "pending",
      });
    }
  }

  // Get licenses linked to this profile
  const { data: licencas } = await (supabase as any)
    .from("perfil_licencas")
    .select("licenca_id, entra_licencas(sku_id, nome)")
    .eq("perfil_id", perfilId);

  if (licencas) {
    for (const l of licencas) {
      if (!l.entra_licencas) continue;
      await supabase.from("iam_queue" as any).insert({
        action_type: action === "add" ? "assign_license" : "remove_license",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          skuId: l.entra_licencas.sku_id,
          licenseName: l.entra_licencas.nome,
          action,
        },
        target_identity: samAccountName,
        requested_by: "sistema",
        status: "pending",
      });
    }
  }
}
