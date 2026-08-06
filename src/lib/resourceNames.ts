import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** A payload name is "real" when it isn't empty, isn't a UUID and isn't just the resource id. */
function usableName(name: unknown, id?: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (isUuid(trimmed)) return null;
  if (id && typeof id === "string" && trimmed.toLowerCase() === id.trim().toLowerCase()) return null;
  return trimmed;
}

export function shortId(id: unknown): string {
  const s = String(id ?? "").trim();
  if (!s) return "—";
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}

export interface ResourceCatalogs {
  licencas: Map<string, string>;
  grupos: Map<string, string>;
  apps: Map<string, string>;
  sites: Map<string, string>;
}

const EMPTY_CATALOGS: ResourceCatalogs = {
  licencas: new Map(),
  grupos: new Map(),
  apps: new Map(),
  sites: new Map(),
};

/** Lightweight id → name catalogs, cached across the app. */
export function useResourceCatalogs() {
  return useQuery({
    queryKey: ["resource_name_catalogs"],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<ResourceCatalogs> => {
      const [lic, grp, app, site] = await Promise.all([
        supabase.from("entra_licencas").select("sku_id, nome, friendly_name"),
        supabase.from("entra_grupos").select("id, entra_id, nome"),
        supabase.from("aplicacoes").select("id, entra_id, nome"),
        supabase.from("sharepoint_sites").select("id, site_id, nome"),
      ]);

      const licencas = new Map<string, string>();
      (lic.data ?? []).forEach((l: any) => {
        const label = (l.friendly_name && !isUuid(l.friendly_name) ? l.friendly_name : null) || l.nome;
        if (l.sku_id && label) licencas.set(String(l.sku_id).toLowerCase(), label);
      });

      const grupos = new Map<string, string>();
      (grp.data ?? []).forEach((g: any) => {
        if (!g.nome) return;
        if (g.entra_id) grupos.set(String(g.entra_id).toLowerCase(), g.nome);
        if (g.id) grupos.set(String(g.id).toLowerCase(), g.nome);
      });

      const apps = new Map<string, string>();
      (app.data ?? []).forEach((a: any) => {
        if (!a.nome) return;
        if (a.entra_id) apps.set(String(a.entra_id).toLowerCase(), a.nome);
        if (a.id) apps.set(String(a.id).toLowerCase(), a.nome);
      });

      const sites = new Map<string, string>();
      (site.data ?? []).forEach((s: any) => {
        if (!s.nome) return;
        if (s.site_id) sites.set(String(s.site_id).toLowerCase(), s.nome);
        if (s.id) sites.set(String(s.id).toLowerCase(), s.nome);
      });

      return { licencas, grupos, apps, sites };
    },
  });
}

function lookup(map: Map<string, string>, id: unknown): string | null {
  if (typeof id !== "string" || !id.trim()) return null;
  return map.get(id.trim().toLowerCase()) ?? null;
}

/**
 * Resolves a readable resource name for an iam_queue item.
 * Falls back to the catalog when the payload stored an id as the name.
 */
export function resolveResourceLabel(
  item: { action_type?: string | null; payload_json?: any } | null | undefined,
  catalogs: ResourceCatalogs | undefined,
  fallback = "—",
): string {
  const p = item?.payload_json || {};
  const at = String(item?.action_type || "");
  const cat = catalogs ?? EMPTY_CATALOGS;

  if (at.includes("license")) {
    return (
      usableName(p.licenseName, p.skuId) ||
      lookup(cat.licencas, p.skuId) ||
      usableName(p.skuPartNumber) ||
      (p.skuId ? `Licença ${shortId(p.skuId)}` : fallback)
    );
  }
  if (at.includes("group")) {
    return (
      usableName(p.groupName, p.groupId) ||
      lookup(cat.grupos, p.groupId) ||
      (p.groupId ? `Grupo ${shortId(p.groupId)}` : fallback)
    );
  }
  if (at.includes("sharepoint") || p.resourceType === "sharepoint") {
    return (
      usableName(p.siteName, p.siteId) ||
      lookup(cat.sites, p.siteId) ||
      usableName(p.appName, p.appId) ||
      lookup(cat.apps, p.appId) ||
      (p.siteId || p.appId ? `Site ${shortId(p.siteId || p.appId)}` : fallback)
    );
  }
  if (at.includes("app")) {
    return (
      usableName(p.appName, p.appId) ||
      lookup(cat.apps, p.appId) ||
      (p.appId ? `App ${shortId(p.appId)}` : fallback)
    );
  }

  return (
    usableName(p.groupName) ||
    usableName(p.licenseName) ||
    usableName(p.appName) ||
    usableName(p.siteName) ||
    fallback
  );
}

/** Convenience hook: returns a resolver function bound to the cached catalogs. */
export function useResourceNameResolver() {
  const { data } = useResourceCatalogs();
  return (item: any, fallback = "—") => resolveResourceLabel(item, data, fallback);
}
