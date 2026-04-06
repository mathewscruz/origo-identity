import { supabase } from "@/integrations/supabase/client";

/**
 * Provisions access profiles for a collaborator based on their cargo.
 * - Revokes old cargo-based assignments (origem='cargo')
 * - Creates new assignments for the new cargo's profiles
 * - Generates iam_queue entries for Entra ID group/license/app assignments
 */
export async function provisionCargoAcessos(
  colaboradorId: string,
  newCargoId: string | null,
  oldCargoId: string | null
): Promise<{ provisioned: number; revoked: number; skippedDirectory: boolean }> {
  let revoked = 0;
  let provisioned = 0;
  let skippedDirectory = false;

  // Get colaborador data for iam_queue
  const { data: colab } = await (supabase as any)
    .from("colaboradores")
    .select("nome, email, sam_account_name")
    .eq("id", colaboradorId)
    .single();
  const identity = (colab as any)?.email || (colab as any)?.sam_account_name || "";

  // Revoke old cargo-based assignments
  if (oldCargoId) {
    const { data: activeAssignments } = await supabase
      .from("perfil_atribuicoes")
      .select("perfil_id")
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true);

    if (activeAssignments && activeAssignments.length > 0 && identity) {
      for (const assignment of activeAssignments) {
        await queueProfileAccess(identity, colab?.nome || "", colab?.email || "", assignment.perfil_id, "remove", colaboradorId);
      }
    } else if (activeAssignments && activeAssignments.length > 0 && !identity) {
      console.warn(`[provisionCargoAcessos] sem identidade (email/sam) para colaborador ${colaboradorId} — revogação ignorada`);
      skippedDirectory = true;
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
      if (identity) {
        for (const cp of cargoPerfis) {
          await queueProfileAccess(identity, colab?.nome || "", colab?.email || "", cp.perfil_id, "add", colaboradorId);
        }
      } else {
        console.warn(`[provisionCargoAcessos] sem identidade (email/sam) para colaborador ${colaboradorId} — atribuição ignorada`);
        skippedDirectory = true;
      }
    }
  }

  return { provisioned, revoked, skippedDirectory };
}

/**
 * Queue Entra ID group/license/app assignments for a profile
 */
async function queueProfileAccess(
  identity: string,
  displayName: string,
  mail: string,
  perfilId: string,
  action: "add" | "remove",
  colaboradorId: string
) {
  // Get groups linked to this profile
  const { data: grupos, error: gruposErr } = await (supabase as any)
    .from("perfil_grupos")
    .select("grupo_id, entra_grupos(entra_id, nome, on_premises_sync)")
    .eq("perfil_id", perfilId);

  if (gruposErr) {
    console.error(`[queueProfileAccess] Erro ao buscar grupos do perfil ${perfilId}:`, gruposErr);
  }

  if (grupos) {
    for (const g of grupos) {
      if (!g.entra_grupos) continue;
      const isOnPrem = g.entra_grupos.on_premises_sync || false;
      const { error: insertErr } = await supabase.from("iam_queue" as any).insert({
        action_type: action === "add" ? "assign_group" : "remove_group",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          groupId: g.entra_grupos.entra_id,
          groupName: g.entra_grupos.nome,
          onPremisesSync: isOnPrem,
          action,
        },
        target_identity: samAccountName,
        colaborador_id: colaboradorId,
        requested_by: "sistema",
        status: isOnPrem ? "failed" : "pending",
        error_code: isOnPrem ? "on_premises_managed" : null,
        result_message: isOnPrem ? `Grupo "${g.entra_grupos.nome}" é gerenciado pelo AD local — não pode ser alterado via Entra ID` : null,
        processed_at: isOnPrem ? new Date().toISOString() : null,
      });
      if (insertErr) {
        console.error(`[queueProfileAccess] Erro ao inserir assign_group para ${g.entra_grupos.nome}:`, insertErr);
      }
    }
  }

  // Get licenses linked to this profile
  const { data: licencas, error: licErr } = await (supabase as any)
    .from("perfil_licencas")
    .select("licenca_id, entra_licencas(sku_id, nome)")
    .eq("perfil_id", perfilId);

  if (licErr) {
    console.error(`[queueProfileAccess] Erro ao buscar licenças do perfil ${perfilId}:`, licErr);
  }

  if (licencas) {
    for (const l of licencas) {
      if (!l.entra_licencas) continue;
      const { error: insertErr } = await supabase.from("iam_queue" as any).insert({
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
        colaborador_id: colaboradorId,
        requested_by: "sistema",
        status: "pending",
      });
      if (insertErr) {
        console.error(`[queueProfileAccess] Erro ao inserir assign_license para ${l.entra_licencas.nome}:`, insertErr);
      }
    }
  }

  // Get apps linked to this profile (with entra_id set)
  const { data: apps, error: appsErr } = await (supabase as any)
    .from("perfil_aplicacoes")
    .select("aplicacao_id, aplicacoes(entra_id, nome, default_app_role_id)")
    .eq("perfil_id", perfilId);

  if (appsErr) {
    console.error(`[queueProfileAccess] Erro ao buscar apps do perfil ${perfilId}:`, appsErr);
  }

  if (apps) {
    for (const a of apps) {
      if (!a.aplicacoes || !a.aplicacoes.entra_id) continue;
      const { error: insertErr } = await supabase.from("iam_queue" as any).insert({
        action_type: action === "add" ? "assign_app" : "remove_app",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          appId: a.aplicacoes.entra_id,
          appName: a.aplicacoes.nome,
          appRoleId: a.aplicacoes.default_app_role_id || "00000000-0000-0000-0000-000000000000",
          action,
        },
        target_identity: samAccountName,
        colaborador_id: colaboradorId,
        requested_by: "sistema",
        status: "pending",
      });
      if (insertErr) {
        console.error(`[queueProfileAccess] Erro ao inserir assign_app para ${a.aplicacoes.nome}:`, insertErr);
      }
    }
  }
}
