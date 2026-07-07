import { supabase } from "@/integrations/supabase/client";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";

interface ColabIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
}

// ─── Resource IDs for a profile ───────────────────────────────────

interface PerfilResources {
  grupoIds: string[];
  licencaIds: string[];
  appIds: string[];
  sharepointItems: { siteId: string; pastaId?: string | null; permissao: string }[];
}

/**
 * Fetches all grupo/licenca/app IDs linked to a perfil via separate queries
 * (avoids nested joins that fail without FK).
 */
export async function getPerfilResourceIds(perfilId: string): Promise<PerfilResources> {
  const [gRes, lRes, aRes, spRes] = await Promise.all([
    (supabase as any).from("perfil_grupos").select("grupo_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_licencas").select("licenca_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_aplicacoes").select("aplicacao_id").eq("perfil_id", perfilId),
    (supabase as any).from("perfil_sharepoint").select("site_id, pasta_nivel1_id, pasta_nivel2_id, permissao").eq("perfil_id", perfilId),
  ]);
  return {
    grupoIds: (gRes.data ?? []).map((r: any) => r.grupo_id),
    licencaIds: (lRes.data ?? []).map((r: any) => r.licenca_id),
    appIds: (aRes.data ?? []).map((r: any) => r.aplicacao_id),
    sharepointItems: (spRes.data ?? []).map((r: any) => ({
      siteId: r.site_id,
      pastaId: r.pasta_nivel2_id || r.pasta_nivel1_id || null,
      permissao: r.permissao || "leitura",
    })),
  };
}

/**
 * Merges resources from multiple profiles into a single set of unique IDs.
 */
export async function getMergedResourcesForPerfis(perfilIds: string[]): Promise<PerfilResources> {
  const allG = new Set<string>();
  const allL = new Set<string>();
  const allA = new Set<string>();
  const allSP = new Map<string, { siteId: string; pastaId?: string | null; permissao: string }>();
  for (const pid of perfilIds) {
    const r = await getPerfilResourceIds(pid);
    r.grupoIds.forEach(id => allG.add(id));
    r.licencaIds.forEach(id => allL.add(id));
    r.appIds.forEach(id => allA.add(id));
    r.sharepointItems.forEach(sp => allSP.set(`${sp.siteId}:${sp.pastaId || ""}:${sp.permissao}`, sp));
  }
  return { grupoIds: [...allG], licencaIds: [...allL], appIds: [...allA], sharepointItems: [...allSP.values()] };
}

// ─── Core: generate iam_queue entries from a diff ─────────────────

/**
 * Generates iam_queue entries for a diff of groups/licenses/apps for a set of collaborators.
 * Uses email as primary identity, sam_account_name as fallback.
 */
export async function generateEntraQueueForDiff(
  colabs: ColabIdentity[],
  diff: {
    addedGrupoIds: string[];
    removedGrupoIds: string[];
    addedLicencaIds: string[];
    removedLicencaIds: string[];
    addedAppIds: string[];
    removedAppIds: string[];
    addedSharepointItems?: { siteId: string; pastaId?: string | null; permissao: string }[];
    removedSharepointItems?: { siteId: string; pastaId?: string | null; permissao: string }[];
  },
  opts?: { triggerImmediately?: boolean; requestedBy?: string }
): Promise<number> {
  if (colabs.length === 0) return 0;


  const addedSharepointItems = diff.addedSharepointItems ?? [];
  const removedSharepointItems = diff.removedSharepointItems ?? [];

  const hasDiff =
    diff.addedGrupoIds.length + diff.removedGrupoIds.length +
    diff.addedLicencaIds.length + diff.removedLicencaIds.length +
    diff.addedAppIds.length + diff.removedAppIds.length +
    addedSharepointItems.length + removedSharepointItems.length;
  if (hasDiff === 0) return 0;

  // Fetch metadata for referenced items (separate queries, no joins)
  const allGrupoIds = [...new Set([...diff.addedGrupoIds, ...diff.removedGrupoIds])];
  const allLicencaIds = [...new Set([...diff.addedLicencaIds, ...diff.removedLicencaIds])];
  const allAppIds = [...new Set([...diff.addedAppIds, ...diff.removedAppIds])];
  const allSharepointSiteIds = [...new Set([...addedSharepointItems, ...removedSharepointItems].map(sp => sp.siteId))];
  const allSharepointPastaIds = [...new Set([...addedSharepointItems, ...removedSharepointItems].map(sp => sp.pastaId).filter(Boolean) as string[])];

  const [gruposRes, licencasRes, appsRes, spSitesRes, spPastasRes] = await Promise.all([
    allGrupoIds.length > 0
      ? (supabase as any).from("entra_grupos").select("id, entra_id, nome, on_premises_sync").in("id", allGrupoIds)
      : { data: [] },
    allLicencaIds.length > 0
      ? (supabase as any).from("entra_licencas").select("id, sku_id, nome").in("id", allLicencaIds)
      : { data: [] },
    allAppIds.length > 0
      ? (supabase as any).from("aplicacoes").select("id, entra_id, nome, default_app_role_id").in("id", allAppIds)
      : { data: [] },
    allSharepointSiteIds.length > 0
      ? (supabase as any).from("sharepoint_sites").select("id, site_id, nome, url").in("id", allSharepointSiteIds)
      : { data: [] },
    allSharepointPastaIds.length > 0
      ? (supabase as any).from("sharepoint_pastas").select("id, drive_item_id, nome, caminho").in("id", allSharepointPastaIds)
      : { data: [] },
  ]);

  const grupoMap = new Map<string, any>((gruposRes.data ?? []).map((g: any) => [g.id, g]));
  const licencaMap = new Map<string, any>((licencasRes.data ?? []).map((l: any) => [l.id, l]));
  const appMap = new Map<string, any>((appsRes.data ?? []).map((a: any) => [a.id, a]));
  const spSiteMap = new Map<string, any>((spSitesRes.data ?? []).map((s: any) => [s.id, s]));
  const spPastaMap = new Map<string, any>((spPastasRes.data ?? []).map((p: any) => [p.id, p]));

  const queueEntries: any[] = [];

  for (const colab of colabs) {
    const identity = colab.email || colab.sam_account_name || "";
    if (!identity) continue;

    const base = {
      target_identity: identity,
      requested_by: opts?.requestedBy ?? "sistema",
      colaborador_id: colab.id,
      status: "pending",
    };


    for (const gid of diff.addedGrupoIds) {
      const grp = grupoMap.get(gid);
      if (!grp) continue;
      const isOnPrem = grp.on_premises_sync || false;
      queueEntries.push({
        ...base,
        action_type: "assign_group",
        status: isOnPrem ? "failed" : "pending",
        error_code: isOnPrem ? "on_premises_managed" : null,
        result_message: isOnPrem ? `Grupo "${grp.nome}" é gerenciado pelo AD local` : null,
        processed_at: isOnPrem ? new Date().toISOString() : null,
        payload_json: { displayName: colab.nome, mail: colab.email || "", groupId: grp.entra_id, groupName: grp.nome, onPremisesSync: isOnPrem },
      });
    }

    for (const gid of diff.removedGrupoIds) {
      const grp = grupoMap.get(gid);
      if (!grp) continue;
      queueEntries.push({
        ...base,
        action_type: "remove_group",
        payload_json: { displayName: colab.nome, mail: colab.email || "", groupId: grp.entra_id, groupName: grp.nome },
      });
    }

    for (const lid of diff.addedLicencaIds) {
      const lic = licencaMap.get(lid);
      if (!lic) continue;
      queueEntries.push({
        ...base,
        action_type: "assign_license",
        payload_json: { displayName: colab.nome, mail: colab.email || "", skuId: lic.sku_id, licenseName: lic.nome },
      });
    }

    for (const lid of diff.removedLicencaIds) {
      const lic = licencaMap.get(lid);
      if (!lic) continue;
      queueEntries.push({
        ...base,
        action_type: "remove_license",
        payload_json: { displayName: colab.nome, mail: colab.email || "", skuId: lic.sku_id, licenseName: lic.nome },
      });
    }

    for (const aid of diff.addedAppIds) {
      const app = appMap.get(aid);
      if (!app?.entra_id) continue;
      queueEntries.push({
        ...base,
        action_type: "assign_app",
        payload_json: { displayName: colab.nome, mail: colab.email || "", appId: app.entra_id, appName: app.nome, appRoleId: app.default_app_role_id || "00000000-0000-0000-0000-000000000000" },
      });
    }

    for (const aid of diff.removedAppIds) {
      const app = appMap.get(aid);
      if (!app?.entra_id) continue;
      queueEntries.push({
        ...base,
        action_type: "remove_app",
        payload_json: { displayName: colab.nome, mail: colab.email || "", appId: app.entra_id, appName: app.nome },
      });
    }

    for (const sp of addedSharepointItems) {
      const site = spSiteMap.get(sp.siteId);
      if (!site?.site_id) continue;
      const pasta = sp.pastaId ? spPastaMap.get(sp.pastaId) : null;
      queueEntries.push({
        ...base,
        action_type: "assign_app",
        payload_json: {
          resourceType: "sharepoint",
          displayName: colab.nome,
          mail: colab.email || "",
          siteId: site.site_id,
          siteName: site.nome,
          siteUrl: site.url || null,
          driveItemId: pasta?.drive_item_id || null,
          folderName: pasta?.nome || null,
          folderPath: pasta?.caminho || null,
          permission: sp.permissao || "leitura",
        },
      });
    }

    for (const sp of removedSharepointItems) {
      const site = spSiteMap.get(sp.siteId);
      if (!site?.site_id) continue;
      const pasta = sp.pastaId ? spPastaMap.get(sp.pastaId) : null;
      queueEntries.push({
        ...base,
        action_type: "remove_app",
        payload_json: {
          resourceType: "sharepoint",
          displayName: colab.nome,
          mail: colab.email || "",
          siteId: site.site_id,
          siteName: site.nome,
          siteUrl: site.url || null,
          driveItemId: pasta?.drive_item_id || null,
          folderName: pasta?.nome || null,
          folderPath: pasta?.caminho || null,
          permission: sp.permissao || "leitura",
        },
      });
    }
  }

  if (queueEntries.length > 0) {
    const { error } = await supabase.from("iam_queue" as any).insert(queueEntries);
    if (error) console.error("[entraQueueHelper] insert error:", error);
  }

  if (opts?.triggerImmediately !== false && queueEntries.length > 0) {
    await triggerEntraProcessing(true);
  }

  return queueEntries.length;
}

// ─── Discover affected collaborators ──────────────────────────────

/**
 * Finds all collaborators affected by a perfil change.
 * Looks in both perfil_atribuicoes (direct) AND cargo_perfis -> colaboradores (via cargo).
 */
export async function findAffectedCollaborators(perfilId: string): Promise<ColabIdentity[]> {
  // Source 1: direct perfil_atribuicoes
  const { data: directAssignments } = await supabase
    .from("perfil_atribuicoes")
    .select("colaborador_id")
    .eq("perfil_id", perfilId)
    .eq("ativo", true);

  const directIds = (directAssignments ?? []).map((a: any) => a.colaborador_id).filter(Boolean) as string[];

  // Source 2: cargo_perfis -> cargos -> colaboradores
  const { data: cargoPerfis } = await (supabase as any)
    .from("cargo_perfis")
    .select("cargo_id")
    .eq("perfil_id", perfilId);

  const cargoIds = (cargoPerfis ?? []).map((cp: any) => cp.cargo_id).filter(Boolean) as string[];
  let cargoColabIds: string[] = [];

  if (cargoIds.length > 0) {
    const { data: cargoColabs } = await supabase
      .from("colaboradores")
      .select("id")
      .in("cargo_id", cargoIds)
      .in("status", ["ativo", "ferias", "afastado"]);
    cargoColabIds = (cargoColabs ?? []).map((c: any) => c.id);
  }

  const allIds = [...new Set([...directIds, ...cargoColabIds])];
  if (allIds.length === 0) return [];

  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, nome, email, sam_account_name")
    .in("id", allIds);

  return (colabs ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    email: c.email,
    sam_account_name: c.sam_account_name,
  }));
}

// ─── High-level: queue assign/remove for entire profiles ──────────

/**
 * Queues assign or remove actions for a set of complete profiles for given collaborators.
 * mode="assign" generates assign_* actions for all resources in those profiles.
 * mode="remove" generates remove_* actions.
 */
export async function queueFullProfileActions(
  colabs: ColabIdentity[],
  perfilIds: string[],
  mode: "assign" | "remove",
  opts?: { triggerImmediately?: boolean }
): Promise<number> {
  if (colabs.length === 0 || perfilIds.length === 0) return 0;

  const resources = await getMergedResourcesForPerfis(perfilIds);

  const diff = mode === "assign"
    ? {
        addedGrupoIds: resources.grupoIds,
        removedGrupoIds: [] as string[],
        addedLicencaIds: resources.licencaIds,
        removedLicencaIds: [] as string[],
        addedAppIds: resources.appIds,
        removedAppIds: [] as string[],
        addedSharepointItems: resources.sharepointItems,
        removedSharepointItems: [],
      }
    : {
        addedGrupoIds: [] as string[],
        removedGrupoIds: resources.grupoIds,
        addedLicencaIds: [] as string[],
        removedLicencaIds: resources.licencaIds,
        addedAppIds: [] as string[],
        removedAppIds: resources.appIds,
        addedSharepointItems: [],
        removedSharepointItems: resources.sharepointItems,
      };

  return generateEntraQueueForDiff(colabs, diff, opts);
}

// ─── High-level: reprovision cargo collaborators ──────────────────

/**
 * For a cargo change: materializes perfil_atribuicoes and generates Entra queue entries.
 */
export async function reprovisionCargoCollaborators(
  cargoId: string,
  addedPerfilIds: string[],
  removedPerfilIds: string[]
): Promise<{ queued: number; materialized: number; revoked: number }> {
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, nome, email, sam_account_name")
    .eq("cargo_id", cargoId)
    .in("status", ["ativo", "ferias", "afastado"]);

  const activeColabs = (colabs ?? []) as ColabIdentity[];
  if (activeColabs.length === 0) return { queued: 0, materialized: 0, revoked: 0 };

  let materialized = 0;
  let revoked = 0;
  let totalQueued = 0;

  // Added profiles: create perfil_atribuicoes + queue assign
  for (const perfilId of addedPerfilIds) {
    const inserts = activeColabs.map(c => ({
      perfil_id: perfilId,
      colaborador_id: c.id,
      origem: "cargo",
      ativo: true,
    }));
    const { data: inserted } = await supabase.from("perfil_atribuicoes").insert(inserts).select("id");
    materialized += inserted?.length || 0;
  }

  if (addedPerfilIds.length > 0) {
    const queued = await queueFullProfileActions(activeColabs, addedPerfilIds, "assign", { triggerImmediately: false });
    totalQueued += queued;
  }

  // Removed profiles: revoke perfil_atribuicoes only (no Entra removal — additive only)
  for (const perfilId of removedPerfilIds) {
    const { data: revokedData } = await supabase
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("perfil_id", perfilId)
      .eq("origem", "cargo")
      .eq("ativo", true)
      .in("colaborador_id", activeColabs.map(c => c.id))
      .select("id");
    revoked += revokedData?.length || 0;
  }
  // Note: intentionally NOT queuing remove_* actions for removed profiles.
  // Access is additive — only deactivation (leaver) removes Entra resources.

  if (totalQueued > 0) {
    await triggerEntraProcessing(true);
  }

  return { queued: totalQueued, materialized, revoked };
}
