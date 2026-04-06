import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure auth failed (${res.status}): ${text}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

interface EntraGroup {
  id: string;
  displayName: string;
  description: string | null;
  onPremisesSyncEnabled: boolean | null;
}

async function fetchAllGroups(token: string): Promise<EntraGroup[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const allGroups: EntraGroup[] = [];
  let url: string | null = "https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description,onPremisesSyncEnabled&$top=999";

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (data.value) {
      allGroups.push(...data.value);
      console.log(`Fetched page with ${data.value.length} groups (total so far: ${allGroups.length})`);
    }
    url = data["@odata.nextLink"] || null;
  }

  return allGroups;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    console.log("Fetching Azure token for group sync...");
    const token = await getAzureToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    console.log("Token acquired, fetching all groups from Entra ID...");

    const groups = await fetchAllGroups(token);
    const onPremCount = groups.filter(g => g.onPremisesSyncEnabled === true).length;
    console.log(`Graph API returned ${groups.length} groups total (${onPremCount} on-premises, ${groups.length - onPremCount} cloud-only)`);

    // Batch upsert in chunks of 500
    const BATCH = 500;
    let upserted = 0;

    for (let i = 0; i < groups.length; i += BATCH) {
      const batch = groups.slice(i, i + BATCH).map(g => ({
        entra_id: g.id,
        nome: g.displayName,
        descricao: g.description || null,
        on_premises_sync: g.onPremisesSyncEnabled === true,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("entra_grupos")
        .upsert(batch, { onConflict: "entra_id" });

      if (error) {
        console.error(`Upsert batch ${i}-${i + batch.length} failed:`, error.message);
        throw new Error(`Upsert failed: ${error.message}`);
      }

      upserted += batch.length;
      console.log(`Upserted batch ${Math.floor(i / BATCH) + 1}: ${upserted}/${groups.length}`);
    }

    const result = {
      success: true,
      total: groups.length,
      upserted,
      onPremises: onPremCount,
      cloudOnly: groups.length - onPremCount,
    };

    console.log(`Sync complete: ${JSON.stringify(result)}`);
    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("sync-entra-groups error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: corsHeaders,
    });
  }
});
