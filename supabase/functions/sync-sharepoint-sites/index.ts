import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getGraphToken(): Promise<{ token: string; scopes: string[] }> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default" }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`);

  // Decode JWT payload to log scopes
  let scopes: string[] = [];
  try {
    const payload = JSON.parse(atob(json.access_token.split(".")[1]));
    scopes = (payload.roles || []) as string[];
    console.log("Token roles/scopes:", scopes);
  } catch { console.log("Could not decode token scopes"); }

  return { token: json.access_token, scopes };
}

async function graphGet(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Graph GET ${url} → ${res.status}: ${body}`);
    return null;
  }
  return res.json();
}

async function listAllSites(token: string): Promise<any[]> {
  const sites: any[] = [];

  // Strategy 1: getAllSites (newer, more reliable)
  console.log("Trying GET /sites/getAllSites ...");
  let nextLink: string | null = "https://graph.microsoft.com/v1.0/sites/getAllSites?$top=100&$select=id,displayName,webUrl";
  while (nextLink) {
    const data = await graphGet(token, nextLink);
    if (!data) { console.log("getAllSites failed, falling back..."); break; }
    sites.push(...(data.value || []));
    nextLink = data["@odata.nextLink"] || null;
  }
  if (sites.length > 0) {
    console.log(`getAllSites returned ${sites.length} sites`);
    return sites;
  }

  // Strategy 2: search=* (classic)
  console.log("Trying GET /sites?search=* ...");
  nextLink = "https://graph.microsoft.com/v1.0/sites?search=*&$top=100&$select=id,displayName,webUrl";
  while (nextLink) {
    const data = await graphGet(token, nextLink);
    if (!data) break;
    sites.push(...(data.value || []));
    nextLink = data["@odata.nextLink"] || null;
  }
  if (sites.length > 0) {
    console.log(`search=* returned ${sites.length} sites`);
    return sites;
  }

  // Strategy 3: root site + subsites
  console.log("Trying root site enumeration...");
  const root = await graphGet(token, "https://graph.microsoft.com/v1.0/sites/root?$select=id,displayName,webUrl");
  if (root) {
    sites.push(root);
    // Try to get subsites
    const subsites = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/root/sites?$top=200&$select=id,displayName,webUrl`);
    if (subsites?.value) sites.push(...subsites.value);
  }
  console.log(`Root enumeration returned ${sites.length} sites`);
  return sites;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, scopes } = await getGraphToken();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sites = await listAllSites(token);
    console.log(`Total sites to process: ${sites.length}`);

    if (sites.length === 0) {
      return new Response(JSON.stringify({
        error: "No sites found. Check permissions.",
        scopes,
        hint: "Ensure Sites.Read.All or Sites.FullControl.All is granted under Microsoft Graph (Application), not SharePoint. After granting, wait up to 30 min for propagation."
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let sitesUpserted = 0;
    let pastasUpserted = 0;

    for (const site of sites) {
      // Upsert site
      const { data: siteRow, error: siteErr } = await supabase
        .from("sharepoint_sites")
        .upsert({ site_id: site.id, nome: site.displayName || site.id, url: site.webUrl }, { onConflict: "site_id" })
        .select("id")
        .single();
      if (siteErr) { console.error(`Site upsert error:`, siteErr); continue; }
      sitesUpserted++;
      const siteDbId = siteRow.id;

      // List drives for the site
      const drivesData = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${site.id}/drives?$select=id,name`);
      if (!drivesData?.value) continue;

      for (const drive of drivesData.value) {
        // List root children (level 1 folders)
        const rootChildren = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$filter=folder ne null&$select=id,name,parentReference&$top=200`);
        if (!rootChildren?.value) continue;

        for (const folder1 of rootChildren.value) {
          const caminho1 = `${drive.name}/${folder1.name}`;
          const driveItemId1 = `${drive.id}:${folder1.id}`;

          // Upsert level 1 folder
          const { data: pasta1Row } = await supabase
            .from("sharepoint_pastas")
            .upsert(
              { site_db_id: siteDbId, drive_item_id: driveItemId1, nome: folder1.name, caminho: caminho1, parent_id: null },
              { onConflict: "drive_item_id", ignoreDuplicates: false }
            )
            .select("id")
            .single();

          let pasta1Id: string;
          if (pasta1Row) {
            pasta1Id = pasta1Row.id;
            pastasUpserted++;
          } else {
            // Fallback: fetch existing
            const { data: existing } = await supabase.from("sharepoint_pastas").select("id").eq("drive_item_id", driveItemId1).single();
            if (!existing) continue;
            await supabase.from("sharepoint_pastas").update({ nome: folder1.name, caminho: caminho1, site_db_id: siteDbId }).eq("id", existing.id);
            pasta1Id = existing.id;
            pastasUpserted++;
          }

          // Level 2 folders
          const l2Children = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${folder1.id}/children?$filter=folder ne null&$select=id,name&$top=200`);
          if (!l2Children?.value) continue;

          for (const folder2 of l2Children.value) {
            const caminho2 = `${caminho1}/${folder2.name}`;
            const driveItemId2 = `${drive.id}:${folder2.id}`;
            const { error: p2Err } = await supabase
              .from("sharepoint_pastas")
              .upsert(
                { site_db_id: siteDbId, drive_item_id: driveItemId2, nome: folder2.name, caminho: caminho2, parent_id: pasta1Id },
                { onConflict: "drive_item_id", ignoreDuplicates: false }
              );
            if (!p2Err) pastasUpserted++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ sites: sitesUpserted, pastas: pastasUpserted, scopes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-sharepoint-sites error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
