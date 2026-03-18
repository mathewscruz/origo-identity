import { supabase } from "@/integrations/supabase/client";

/**
 * Provisions access profiles for a collaborator based on their cargo.
 * - Revokes old cargo-based assignments (origem='cargo')
 * - Creates new assignments for the new cargo's profiles
 */
export async function provisionCargoAcessos(
  colaboradorId: string,
  newCargoId: string | null,
  oldCargoId: string | null
): Promise<{ provisioned: number; revoked: number }> {
  let revoked = 0;
  let provisioned = 0;

  // Revoke old cargo-based assignments
  if (oldCargoId) {
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
    }
  }

  return { provisioned, revoked };
}
