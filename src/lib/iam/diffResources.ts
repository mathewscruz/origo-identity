import type { ProfileResources } from "./resolveProfileResources";

export interface ResourceDiff {
  apps: { add: ProfileResources["apps"]; remove: ProfileResources["apps"] };
  groups: { add: ProfileResources["groups"]; remove: ProfileResources["groups"] };
  licenses: { add: ProfileResources["licenses"]; remove: ProfileResources["licenses"] };
  sharepoint: { add: ProfileResources["sharepoint"]; remove: ProfileResources["sharepoint"] };
}

/**
 * Computes the additive/removal diff between two resource bundles.
 *
 * "current" = what the identity already has (resolved from active profiles).
 * "next"    = what the identity should have after the change.
 *
 * Additive provisioning: a resource present in `current` but missing from `next`
 * is reported in `remove`, never silently dropped. Callers decide whether to
 * actually emit removals (e.g. profile change vs. leaver vs. mover).
 */
export function diffResources(current: ProfileResources, next: ProfileResources): ResourceDiff {
  const appKey = (a: ProfileResources["apps"][number]) => `${a.aplicacao_id}:${a.app_role_id ?? ""}`;
  const spKey = (s: ProfileResources["sharepoint"][number]) => `${s.site_id}:${s.pasta_nivel1_id ?? ""}:${s.pasta_nivel2_id ?? ""}:${s.permissao}`;

  const curApp = new Set(current.apps.map(appKey));
  const nextApp = new Set(next.apps.map(appKey));
  const curGrp = new Set(current.groups.map((g) => g.entra_grupo_id));
  const nextGrp = new Set(next.groups.map((g) => g.entra_grupo_id));
  const curLic = new Set(current.licenses.map((l) => l.licenca_id));
  const nextLic = new Set(next.licenses.map((l) => l.licenca_id));
  const curSp = new Set(current.sharepoint.map(spKey));
  const nextSp = new Set(next.sharepoint.map(spKey));

  return {
    apps: {
      add: next.apps.filter((a) => !curApp.has(appKey(a))),
      remove: current.apps.filter((a) => !nextApp.has(appKey(a))),
    },
    groups: {
      add: next.groups.filter((g) => !curGrp.has(g.entra_grupo_id)),
      remove: current.groups.filter((g) => !nextGrp.has(g.entra_grupo_id)),
    },
    licenses: {
      add: next.licenses.filter((l) => !curLic.has(l.licenca_id)),
      remove: current.licenses.filter((l) => !nextLic.has(l.licenca_id)),
    },
    sharepoint: {
      add: next.sharepoint.filter((s) => !curSp.has(spKey(s))),
      remove: current.sharepoint.filter((s) => !nextSp.has(spKey(s))),
    },
  };
}
