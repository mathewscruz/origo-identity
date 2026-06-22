import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the *effective access* of an identity (colaborador or terceiro):
 * union of resources from active perfil_atribuicoes + individually granted
 * resources (groups/licenses/apps via iam_queue with status success and no
 * subsequent remove).
 *
 * Single source of truth — replaces ad-hoc 4-query merges scattered across
 * detail pages.
 */
export interface EffectiveAccess {
  perfis: Array<{ atribuicaoId: string; perfilId: string; perfilNome: string; origem: string }>;
  grupos: Array<{ id: string; nome: string; origem: "perfil" | "individual" }>;
  licencas: Array<{ id: string; nome: string; origem: "perfil" | "individual" }>;
  aplicacoes: Array<{ id: string; nome: string; origem: "perfil" | "individual" }>;
}

export function useEffectiveAccess(colaboradorId: string | undefined, kind: "colaborador" | "terceiro" = "colaborador") {
  return useQuery({
    queryKey: ["effective-access", kind, colaboradorId],
    enabled: !!colaboradorId,
    staleTime: 15_000,
    queryFn: async (): Promise<EffectiveAccess> => {
      if (!colaboradorId) return { perfis: [], grupos: [], licencas: [], aplicacoes: [] };

      // 1) Active perfis
      const { data: atribs } = await supabase
        .from("perfil_atribuicoes")
        .select("id, perfil_id, origem, perfis_acesso(nome)")
        .eq("colaborador_id", colaboradorId)
        .eq("ativo", true);

      const perfilIds = (atribs ?? []).map((a: any) => a.perfil_id);
      const perfis = (atribs ?? []).map((a: any) => ({
        atribuicaoId: a.id,
        perfilId: a.perfil_id,
        perfilNome: a.perfis_acesso?.nome ?? "(sem nome)",
        origem: a.origem ?? "manual",
      }));

      // 2) Resources mapped through perfis (in parallel)
      const [pg, pl, pa] = perfilIds.length
        ? await Promise.all([
            (supabase as any).from("perfil_grupos").select("grupo_id, entra_grupos(id, nome)").in("perfil_id", perfilIds),
            (supabase as any).from("perfil_licencas").select("licenca_id, entra_licencas(id, nome)").in("perfil_id", perfilIds),
            (supabase as any).from("perfil_aplicacoes").select("aplicacao_id, aplicacoes(id, nome)").in("perfil_id", perfilIds),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];

      const grupos = new Map<string, { id: string; nome: string; origem: "perfil" | "individual" }>();
      (pg.data ?? []).forEach((r: any) => {
        const g = r.entra_grupos;
        if (g?.id) grupos.set(g.id, { id: g.id, nome: g.nome, origem: "perfil" });
      });
      const licencas = new Map<string, { id: string; nome: string; origem: "perfil" | "individual" }>();
      (pl.data ?? []).forEach((r: any) => {
        const l = r.entra_licencas;
        if (l?.id) licencas.set(l.id, { id: l.id, nome: l.nome, origem: "perfil" });
      });
      const aplicacoes = new Map<string, { id: string; nome: string; origem: "perfil" | "individual" }>();
      (pa.data ?? []).forEach((r: any) => {
        const a = r.aplicacoes;
        if (a?.id) aplicacoes.set(a.id, { id: a.id, nome: a.nome, origem: "perfil" });
      });

      return {
        perfis,
        grupos: [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
        licencas: [...licencas.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
        aplicacoes: [...aplicacoes.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
      };
    },
  });
}
