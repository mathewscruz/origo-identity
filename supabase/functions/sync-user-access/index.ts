import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function getAzureToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Azure auth failed (${res.status})`);
  const { access_token } = await res.json();
  return access_token;
}

async function resolveEntraUser(token: string, email: string | null, sam: string | null): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}` };
  if (email) {
    const filter = encodeURIComponent(`mail eq '${email}' or userPrincipalName eq '${email}'`);
    const res = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${filter}&$select=id`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.value?.length > 0) return data.value[0].id;
    }
  }
  if (sam) {
    const filter = encodeURIComponent(`onPremisesSamAccountName eq '${sam}'`);
    const res = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${filter}&$select=id`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.value?.length > 0) return data.value[0].id;
    }
  }
  return null;
}

interface EntraGroup { id: string; displayName: string; onPremisesSyncEnabled: boolean; groupTypes?: string[]; membershipRule?: string | null; isAssignableToRole?: boolean | null; }
interface EntraLicense { skuId: string; }
interface EntraAppRole { assignmentId: string; resourceId: string; resourceDisplayName: string; appRoleId: string; principalId: string; }

async function fetchUserGroups(token: string, userId: string): Promise<EntraGroup[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const groups: EntraGroup[] = [];
  const seen = new Set<string>();

  // Import only direct memberOf groups. Transitive/nested groups appear in Entra
  // counts for effective access, but cannot be removed from the user directly;
  // they should be managed via the parent direct group instead.
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${userId}/memberOf/microsoft.graph.group?$select=id,displayName,onPremisesSyncEnabled,groupTypes,membershipRule,isAssignableToRole&$top=999`;
  while (url) {
    const currentUrl: string = url;
    const res: Response = await fetch(currentUrl, { headers });
    if (!res.ok) {
      console.error(`memberOf/microsoft.graph.group failed (${res.status})`);
      break;
    }
    const data: any = await res.json();
    for (const item of (data.value || [])) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        groups.push({
          id: item.id,
          displayName: item.displayName,
          onPremisesSyncEnabled: !!item.onPremisesSyncEnabled,
          groupTypes: item.groupTypes || [],
          membershipRule: item.membershipRule || null,
          isAssignableToRole: item.isAssignableToRole ?? null,
        });
      }
    }
    url = data["@odata.nextLink"] || null;
  }
  return groups;
}

async function fetchUserLicenses(token: string, userId: string): Promise<EntraLicense[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}/licenseDetails?$select=skuId`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value || []).map((l: any) => ({ skuId: l.skuId }));
}

async function fetchUserAppRoles(token: string, userId: string): Promise<EntraAppRole[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const roles: EntraAppRole[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${userId}/appRoleAssignments?$top=999`;
  while (url) {
    const currentUrl: string = url;
    const res: Response = await fetch(currentUrl, { headers });
    if (!res.ok) break;
    const data: any = await res.json();
    for (const item of (data.value || [])) {
      roles.push({
        assignmentId: item.id,
        principalId: item.principalId,
        resourceId: item.resourceId,
        resourceDisplayName: item.resourceDisplayName || "",
        appRoleId: item.appRoleId || "00000000-0000-0000-0000-000000000000",
      });
    }
    url = data["@odata.nextLink"] || null;
  }
  return roles;
}

/** Build a unique key for a queue entry to deduplicate */
function queueKey(actionType: string, payload: any): string {
  if (actionType === "assign_group" || actionType === "remove_group") return `group:${payload.groupId}`;
  if (actionType === "assign_license" || actionType === "remove_license") return `license:${payload.skuId}`;
  if (actionType === "assign_app" || actionType === "remove_app") return `app:${payload.appId}:${payload.appRoleId || ""}`;
  return `${actionType}:${JSON.stringify(payload)}`;
}

const resourceKeyFor = (action: string, p: Record<string, any>): string | null =>
  action.endsWith("_group") ? `grupo:${p.groupId}` : action.endsWith("_license") ? `licenca:${p.skuId}` : action.endsWith("_app") ? `app:${p.appId}` : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Azure credentials not configured" }), {
      status: 500, headers: corsHeaders,
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { colaborador_id } = await req.json();
    if (!colaborador_id) {
      return new Response(JSON.stringify({ error: "colaborador_id required" }), { status: 400, headers: corsHeaders });
    }

    const { data: colab, error: colabErr } = await sb
      .from("colaboradores")
      .select("id, nome, email, sam_account_name")
      .eq("id", colaborador_id)
      .single();
    if (colabErr || !colab) {
      return new Response(JSON.stringify({ error: "Collaborator not found" }), { status: 404, headers: corsHeaders });
    }

    if (!colab.email && !colab.sam_account_name) {
      return new Response(JSON.stringify({ success: true, skipped: true, message: "No identity to resolve" }), { headers: corsHeaders });
    }

    const token = await getAzureToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    const entraUserId = await resolveEntraUser(token, colab.email, colab.sam_account_name);

    if (!entraUserId) {
      console.log(`User not found in Entra ID: ${colab.email || colab.sam_account_name}`);
      return new Response(JSON.stringify({ success: true, skipped: true, message: "User not found in Entra ID" }), { headers: corsHeaders });
    }

    await sb.from("colaboradores").update({ entra_id: entraUserId }).eq("id", colaborador_id);

    const [userGroups, userLicenses, userAppRoles] = await Promise.all([
      fetchUserGroups(token, entraUserId),
      fetchUserLicenses(token, entraUserId),
      fetchUserAppRoles(token, entraUserId),
    ]);

    console.log(`Entra access for ${colab.nome}: ${userGroups.length} groups, ${userLicenses.length} licenses, ${userAppRoles.length} app roles`);

    // ---- Fetch latest effective queue state for this collaborator to deduplicate ----
    // If a resource exists in Entra now but its latest IAM row is a successful remove,
    // insert a fresh entra_sync assign row so the IAM screen reflects the current truth.
    const activeKeys = new Set<string>();
    const currentKeys = new Set<string>();
    const latestByKey = new Map<string, any>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: existing, error: exErr } = await sb
          .from("iam_queue")
          .select("action_type, payload_json, status, created_at")
          .eq("colaborador_id", colaborador_id)
          .in("requested_by", ["entra_sync", "manual_individual"])
          .in("action_type", ["assign_group", "remove_group", "assign_license", "remove_license", "assign_app", "remove_app"])
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (exErr) { console.error("existing queue query error:", exErr.message); break; }
        if (!existing || existing.length === 0) break;
        for (const row of existing) {
          const p = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
          const key = queueKey(row.action_type, p);
          latestByKey.set(key, row);
        }
        if (existing.length < PAGE) break;
        from += PAGE;
      }
      for (const [key, row] of latestByKey.entries()) {
        if (row.action_type.startsWith("assign_") && row.status === "success") activeKeys.add(key);
        // Failed remove attempts do not remove an active Entra assignment; a later
        // sync will re-import it if Graph still shows it assigned.
      }
    }
    console.log(`Active imported/manual keys for dedup: ${activeKeys.size}`);

    const identity = colab.email || colab.sam_account_name || "";
    const queueEntries: any[] = [];

    // Match groups
    if (userGroups.length > 0) {
      const entraIds = userGroups.map(g => g.id);
      const BATCH_IN = 50;
      const localGroups: any[] = [];
      for (let b = 0; b < entraIds.length; b += BATCH_IN) {
        const slice = entraIds.slice(b, b + BATCH_IN);
        const { data, error } = await sb.from("entra_grupos").select("id, entra_id, nome").in("entra_id", slice);
        if (error) console.error("entra_grupos query error:", error.message);
        if (data) localGroups.push(...data);
      }
      const matchedIds = new Set(localGroups.map((g: any) => g.entra_id));
      const missingGroups = userGroups.filter(g => !matchedIds.has(g.id));
      if (missingGroups.length > 0) {
        const { data: insertedGroups, error: insErr } = await sb
          .from("entra_grupos")
          .upsert(
            missingGroups.map(g => ({
              entra_id: g.id,
              nome: g.displayName || g.id,
              descricao: "Importado automaticamente do Entra ID durante sync de usuário",
              on_premises_sync: !!g.onPremisesSyncEnabled,
              owner: "entra_sync",
            })),
            { onConflict: "entra_id" },
          )
          .select("id, entra_id, nome");
        if (insErr) console.error("entra_grupos auto-upsert error:", insErr.message);
        if (insertedGroups) localGroups.push(...insertedGroups);
      }
      console.log(`Groups: ${userGroups.length} from Entra, ${localGroups.length} matched/auto-cataloged locally.`);
      if (localGroups.length === 0 && userGroups.length > 0) {
        console.warn(`No local group matches. First 5 Entra group names: ${userGroups.slice(0, 5).map(g => `${g.displayName} (${g.id})`).join(", ")}`);
      }
      for (const lg of localGroups) {
        const src = userGroups.find(g => g.id === lg.entra_id);
        const payload = {
          displayName: colab.nome,
          mail: colab.email || "",
          groupId: lg.entra_id,
          groupName: lg.nome,
          onPremisesSync: !!src?.onPremisesSyncEnabled,
          dynamicMembership: !!src?.groupTypes?.includes("DynamicMembership"),
          membershipRule: src?.membershipRule || null,
          isAssignableToRole: src?.isAssignableToRole ?? null,
        };
        const key = queueKey("assign_group", payload);
        currentKeys.add(key);
        if (activeKeys.has(key)) continue;
        queueEntries.push({
          action_type: "assign_group",
          resource_key: resourceKeyFor("assign_group", payload),
          target_identity: identity,
          colaborador_id: colaborador_id,
          requested_by: "entra_sync",
          status: "success",
          processed_at: new Date().toISOString(),
          result_message: "Importado do Entra ID (já existente)",
          payload_json: payload,
        });
      }
    }

    // Match licenses
    if (userLicenses.length > 0) {
      const skuIds = userLicenses.map(l => l.skuId);
      const { data: localLicenses } = await sb.from("entra_licencas").select("id, sku_id, nome").in("sku_id", skuIds);
      for (const ll of (localLicenses || [])) {
        const payload = {
          displayName: colab.nome,
          mail: colab.email || "",
          skuId: ll.sku_id,
          licenseName: ll.nome,
        };
        const key = queueKey("assign_license", payload);
        currentKeys.add(key);
        if (activeKeys.has(key)) continue;
        queueEntries.push({
          action_type: "assign_license",
          resource_key: resourceKeyFor("assign_license", payload),
          target_identity: identity,
          colaborador_id: colaborador_id,
          requested_by: "entra_sync",
          status: "success",
          processed_at: new Date().toISOString(),
          result_message: "Importado do Entra ID (já existente)",
          payload_json: payload,
        });
      }
    }

    // Match apps
    if (userAppRoles.length > 0) {
      const resourceIds = userAppRoles.map(a => a.resourceId);
      const { data: localApps } = await sb.from("aplicacoes").select("id, entra_id, nome").in("entra_id", resourceIds);
      for (const la of (localApps || [])) {
        const role = userAppRoles.find(a => a.resourceId === la.entra_id);
        const payload = {
          displayName: colab.nome,
          mail: colab.email || "",
          appId: la.entra_id,
          appName: la.nome,
          appRoleId: role?.appRoleId || "00000000-0000-0000-0000-000000000000",
          assignmentId: role?.assignmentId || null,
          principalId: role?.principalId || entraUserId,
        };
        const key = queueKey("assign_app", payload);
        currentKeys.add(key);
        if (activeKeys.has(key)) continue;
        queueEntries.push({
          action_type: "assign_app",
          resource_key: resourceKeyFor("assign_app", payload),
          target_identity: identity,
          colaborador_id: colaborador_id,
          requested_by: "entra_sync",
          status: "success",
          processed_at: new Date().toISOString(),
          result_message: "Importado do Entra ID (já existente)",
          payload_json: payload,
        });
      }
    }

    // Mark resources that were previously shown as active but are no longer present in Entra.
    for (const [key, row] of latestByKey.entries()) {
      if (!activeKeys.has(key) || currentKeys.has(key)) continue;
      const actionType = row.action_type as string;
      if (!actionType.startsWith("assign_")) continue;
      const reverseAction = actionType === "assign_group"
        ? "remove_group"
        : actionType === "assign_license"
          ? "remove_license"
          : actionType === "assign_app"
            ? "remove_app"
            : null;
      if (!reverseAction) continue;
      const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
      queueEntries.push({
        action_type: reverseAction,
        resource_key: resourceKeyFor(reverseAction, payload),
        target_identity: identity,
        colaborador_id,
        requested_by: "entra_sync",
        status: "success",
        processed_at: new Date().toISOString(),
        result_message: "Correção de sync: recurso não está mais presente no Entra ID",
        payload_json: { ...payload, syncCorrection: true, reason: "not_present_in_entra" },
      });
    }

    // Insert only new entries
    let inserted = 0;
    if (queueEntries.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < queueEntries.length; i += BATCH) {
        const batch = queueEntries.slice(i, i + BATCH);
        const { error } = await sb.from("iam_queue").insert(batch);
        if (error) console.error("Queue insert error:", error.message);
        else inserted += batch.length;
      }
    }

    const result = {
      success: true,
      colaborador_id,
      entra_user_id: entraUserId,
      groups: userGroups.length,
      licenses: userLicenses.length,
      apps: userAppRoles.length,
      queued: inserted,
      skipped_existing: activeKeys.size,
    };

    console.log(`sync-user-access complete: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-user-access error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
