import { supabase } from "@/integrations/supabase/client";

export interface ProfileResources {
  apps: { aplicacao_id: string; app_role_id?: string | null }[];
  groups: { entra_grupo_id: string }[];
  licenses: { licenca_id: string }[];
  sharepoint: { site_id: string; pasta_nivel1_id?: string | null; pasta_nivel2_id?: string | null; permissao: string }[];
}

/** Returns all resources granted by a single access profile. Pure read; no side effects. */
export async function resolveProfileResources(perfilId: string): Promise<ProfileResources> {
  const [appsRes, groupsRes, licensesRes, spRes] = await Promise.all([
    (supabase as any).from("perfil_aplicacoes").select("aplicacao_id, app_role_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_grupos").select("entra_grupo_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_licencas").select("licenca_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_sharepoint").select("site_id, pasta_nivel1_id, pasta_nivel2_id, permissao").eq("perfil_id", perfilId),
  ]);
  return {
    apps: appsRes.data ?? [],
    groups: groupsRes.data ?? [],
    licenses: licensesRes.data ?? [],
    sharepoint: spRes.data ?? [],
  };
}

/** Resolve multiple profiles at once and merge their resources (deduped). */
export async function resolveProfilesResources(perfilIds: string[]): Promise<ProfileResources> {
  if (perfilIds.length === 0) return { apps: [], groups: [], licenses: [], sharepoint: [] };
  const all = await Promise.all(perfilIds.map(resolveProfileResources));
  const appSeen = new Set<string>();
  const grpSeen = new Set<string>();
  const licSeen = new Set<string>();
  const spSeen = new Set<string>();
  const merged: ProfileResources = { apps: [], groups: [], licenses: [], sharepoint: [] };
  for (const r of all) {
    for (const a of r.apps) {
      const k = `${a.aplicacao_id}:${a.app_role_id ?? ""}`;
      if (!appSeen.has(k)) { appSeen.add(k); merged.apps.push(a); }
    }
    for (const g of r.groups) {
      if (!grpSeen.has(g.entra_grupo_id)) { grpSeen.add(g.entra_grupo_id); merged.groups.push(g); }
    }
    for (const l of r.licenses) {
      if (!licSeen.has(l.licenca_id)) { licSeen.add(l.licenca_id); merged.licenses.push(l); }
    }
    for (const s of r.sharepoint) {
      const k = `${s.site_id}:${s.pasta_nivel2_id ?? s.pasta_nivel1_id ?? ""}:${s.permissao}`;
      if (!spSeen.has(k)) { spSeen.add(k); merged.sharepoint.push(s); }
    }
  }
  return merged;
}
