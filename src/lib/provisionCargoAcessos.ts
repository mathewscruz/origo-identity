import { supabase } from "@/integrations/supabase/client";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";

interface ColabIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
}

/**
 * Provisions access profiles for a collaborator based on their cargo change.
 * - Revokes old cargo-based assignments (origem='cargo')
 * - Creates new assignments for the new cargo's profiles
 * - Delegates ALL iam_queue generation to the central helper
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

  // ── Revoke old cargo-based assignments ──
  if (oldCargoId) {
    // Get old cargo's profile IDs
    const { data: oldCargoPerfis } = await (supabase as any)
      .from("cargo_perfis")
      .select("perfil_id")
      .eq("cargo_id", oldCargoId);

    const oldPerfilIds = (oldCargoPerfis ?? []).map((cp: any) => cp.perfil_id);

    // Queue remove actions BEFORE revoking assignments
    if (hasIdentity && oldPerfilIds.length > 0) {
      await queueFullProfileActions([colabIdentity], oldPerfilIds, "remove", { triggerImmediately: false });
    } else if (!hasIdentity && oldPerfilIds.length > 0) {
      skippedDirectory = true;
    }

    // Revoke perfil_atribuicoes
    const { data: revokedData } = await supabase
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true)
      .select("id");
    revoked = revokedData?.length || 0;
  }

  // ── Create new cargo-based assignments ──
  if (newCargoId) {
    const { data: newCargoPerfis } = await (supabase as any)
      .from("cargo_perfis")
      .select("perfil_id")
      .eq("cargo_id", newCargoId);

    const newPerfilIds = (newCargoPerfis ?? []).map((cp: any) => cp.perfil_id);

    if (newPerfilIds.length > 0) {
      // Materialize perfil_atribuicoes
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

      // Queue assign actions
      if (hasIdentity) {
        await queueFullProfileActions([colabIdentity], newPerfilIds, "assign", { triggerImmediately: false });
      } else {
        skippedDirectory = true;
      }
    }
  }

  // Trigger processing once for all queued actions
  if (!skippedDirectory && (revoked > 0 || provisioned > 0)) {
    triggerEntraProcessing(true);
  }

  return { provisioned, revoked, skippedDirectory };
}
