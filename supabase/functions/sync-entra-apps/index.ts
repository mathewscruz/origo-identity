import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure auth failed (${res.status}): ${text}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

async function graphGetAll(token: string, url: string): Promise<any[]> {
  const all: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API error (${res.status}): ${text}`);
    }
    const json = await res.json();
    all.push(...(json.value || []));
    nextUrl = json["@odata.nextLink"] || null;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const tenantId = Deno.env.get("AZURE_TENANT_ID");
    const clientId = Deno.env.get("AZURE_CLIENT_ID");
    const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
    if (!tenantId || !clientId || !clientSecret) {
      return jsonResponse({ error: "Azure credentials not configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("[sync-entra-apps] Starting Azure app sync...");
    const token = await getAzureToken(tenantId, clientId, clientSecret);

    // Fetch Enterprise Applications (Service Principals)
    const spUrl = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=tags/any(t: t eq 'WindowsAzureActiveDirectoryIntegratedApp')&$select=id,displayName,appId,servicePrincipalType&$top=999`;
    const servicePrincipals = await graphGetAll(token, spUrl);
    console.log(`[sync-entra-apps] Fetched ${servicePrincipals.length} service principals`);

    // Get existing apps from DB
    const { data: existingApps } = await supabase.from("aplicacoes").select("id, nome, entra_id");
    const existingByEntraId = new Map((existingApps || []).filter((a: any) => a.entra_id).map((a: any) => [a.entra_id, a]));
    const existingByName = new Map((existingApps || []).filter((a: any) => !a.entra_id).map((a: any) => [a.nome.toLowerCase(), a]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const sp of servicePrincipals) {
      const entraId = sp.id;
      const nome = sp.displayName || "Unknown App";

      if (existingByEntraId.has(entraId)) {
        // Already exists with this entra_id — update name if changed
        const existing = existingByEntraId.get(entraId);
        if (existing.nome !== nome) {
          await supabase.from("aplicacoes").update({ nome, origem: "azure" }).eq("id", existing.id);
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      // Check if a manual app with same name exists — link it
      const manualMatch = existingByName.get(nome.toLowerCase());
      if (manualMatch) {
        await supabase.from("aplicacoes").update({
          entra_id: entraId,
          integracao_ativa: true,
          tipo_auth: "SSO",
          origem: "azure",
        }).eq("id", manualMatch.id);
        updated++;
        existingByName.delete(nome.toLowerCase());
        continue;
      }

      // New app — insert
      const { error } = await supabase.from("aplicacoes").insert({
        nome,
        entra_id: entraId,
        integracao_ativa: true,
        tipo_auth: "SSO",
        origem: "azure",
        criticidade: "media",
      });
      if (error) {
        // Could be duplicate entra_id race condition
        if (error.code === "23505") {
          skipped++;
        } else {
          console.error(`[sync-entra-apps] Error inserting ${nome}:`, error.message);
        }
      } else {
        created++;
      }
    }

    const summary = { total: servicePrincipals.length, created, updated, skipped };
    console.log("[sync-entra-apps] Sync complete:", summary);
    return jsonResponse(summary);
  } catch (err) {
    console.error("[sync-entra-apps] Error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});
