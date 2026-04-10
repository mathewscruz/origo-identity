import { supabase } from "@/integrations/supabase/client";
import { getMergedResourcesForPerfis, generateEntraQueueForDiff } from "@/lib/entraQueueHelper";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";

interface ColabIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
}

/**
 * Provisions access profiles for a collaborator based on their cargo change.
 * Uses delta calculation: only adds/removes what actually changed between old and new cargo.
 * Resources common to both cargos remain untouched in Entra ID.
 */
export async function provisionCargoAcessos(
  colaboradorId: string,
  newCargoId: string | null,
  oldCargoId: string | null
): Promise<{ provisioned: number; revoked: number; skippedDirectory: boolean }> {
  let revoked = 0;
  let provisioned = 0;
  let skippedDirectory = false;

  // Get colaborador data
  const { data: colab } = await supabase
    .from("colaboradores")
    .select("id, nome, email, sam_account_name")
    .eq("id", colaboradorId)
    .single();

  if (!colab) return { provisioned: 0, revoked: 0, skippedDirectory: true };

  const colabIdentity: ColabIdentity = {
    id: colab.id,
    nome: colab.nome,
    email: colab.email,
    sam_account_name: colab.sam_account_name,
  };

  const hasIdentity = !!(colab.email || colab.sam_account_name);

  // Get perfil IDs for old and new cargo
  const getCargoPerfilIds = async (cargoId: string | null): Promise<string[]> => {
    if (!cargoId) return [];
    const { data } = await (supabase as any)
      .from("cargo_perfis")
      .select("perfil_id")
      .eq("cargo_id", cargoId);
    return (data ?? []).map((cp: any) => cp.perfil_id);
  };

  const [oldPerfilIds, newPerfilIds] = await Promise.all([
    getCargoPerfilIds(oldCargoId),
    getCargoPerfilIds(newCargoId),
  ]);

  // Get merged resources for old and new sets
  const [oldResources, newResources] = await Promise.all([
    oldPerfilIds.length > 0 ? getMergedResourcesForPerfis(oldPerfilIds) : { grupoIds: [], licencaIds: [], appIds: [] },
    newPerfilIds.length > 0 ? getMergedResourcesForPerfis(newPerfilIds) : { grupoIds: [], licencaIds: [], appIds: [] },
  ]);

  // Calculate delta — only additions, never remove existing access
  const oldGrupoSet = new Set(oldResources.grupoIds);
  const oldLicencaSet = new Set(oldResources.licencaIds);
  const oldAppSet = new Set(oldResources.appIds);

  const diff = {
    addedGrupoIds: newResources.grupoIds.filter(id => !oldGrupoSet.has(id)),
    removedGrupoIds: [] as string[],  // Never remove on cargo change
    addedLicencaIds: newResources.licencaIds.filter(id => !oldLicencaSet.has(id)),
    removedLicencaIds: [] as string[],  // Never remove on cargo change
    addedAppIds: newResources.appIds.filter(id => !oldAppSet.has(id)),
    removedAppIds: [] as string[],  // Never remove on cargo change
  };

  // Revoke old cargo-based perfil_atribuicoes
  if (oldCargoId && oldPerfilIds.length > 0) {
    const { data: revokedData } = await supabase
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true)
      .select("id");
    revoked = revokedData?.length || 0;
  }

  // Create new cargo-based perfil_atribuicoes
  if (newCargoId && newPerfilIds.length > 0) {
    // Safeguard: deactivate any existing active cargo atribuicoes to prevent duplicates
    await supabase
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() } as any)
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true);

    const inserts = newPerfilIds.map((perfilId: string) => ({
      perfil_id: perfilId,
      colaborador_id: colaboradorId,
      origem: "cargo",
      ativo: true,
    }));

    const { data: inserted } = await supabase
      .from("perfil_atribuicoes")
      .insert(inserts)
      .select("id");
    provisioned = inserted?.length || 0;
  }

  // Queue Entra ID actions for the delta only
  if (hasIdentity) {
    const hasDiff =
      diff.addedGrupoIds.length + diff.removedGrupoIds.length +
      diff.addedLicencaIds.length + diff.removedLicencaIds.length +
      diff.addedAppIds.length + diff.removedAppIds.length;

    if (hasDiff > 0) {
      await generateEntraQueueForDiff([colabIdentity], diff, { triggerImmediately: false });
    }
  } else if (oldPerfilIds.length > 0 || newPerfilIds.length > 0) {
    skippedDirectory = true;
  }

  // Trigger processing once for all queued actions
  if (!skippedDirectory && (revoked > 0 || provisioned > 0)) {
    triggerEntraProcessing(true);
  }

  return { provisioned, revoked, skippedDirectory };
}
