import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
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
  mailEnabled: boolean;
  securityEnabled: boolean;
  groupTypes: string[];
}

async function fetchAllGroups(token: string): Promise<EntraGroup[]> {
  const headers = { Authorization: `Bearer ${token}` };
  const allGroups: EntraGroup[] = [];
  let url: string | null = "https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description,onPremisesSyncEnabled,mailEnabled,securityEnabled,groupTypes&$top=999";

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (data.value) {
      allGroups.push(...data.value);
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
    console.log(`Found ${groups.length} groups in Entra ID`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const group of groups) {
      const isOnPrem = group.onPremisesSyncEnabled === true;

      // Check if group already exists by entra_id
      const { data: existing } = await supabase
        .from("entra_grupos")
        .select("id, nome, descricao, on_premises_sync")
        .eq("entra_id", group.id)
        .maybeSingle();

      if (existing) {
        // Update if name, description or on_premises_sync changed
        const needsUpdate =
          existing.nome !== group.displayName ||
          existing.descricao !== (group.description || null) ||
          existing.on_premises_sync !== isOnPrem;

        if (needsUpdate) {
          await supabase
            .from("entra_grupos")
            .update({
              nome: group.displayName,
              descricao: group.description || null,
              on_premises_sync: isOnPrem,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Insert new group
        await supabase.from("entra_grupos").insert({
          entra_id: group.id,
          nome: group.displayName,
          descricao: group.description || null,
          on_premises_sync: isOnPrem,
        });
        created++;
      }
    }

    const result = {
      success: true,
      total: groups.length,
      created,
      updated,
      skipped,
      onPremises: groups.filter(g => g.onPremisesSyncEnabled === true).length,
      cloudOnly: groups.filter(g => g.onPremisesSyncEnabled !== true).length,
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
