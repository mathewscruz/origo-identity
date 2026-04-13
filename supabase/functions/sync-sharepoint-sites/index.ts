import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getGraphToken(): Promise<string> {
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
  return json.access_token;
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
  let nextLink: string | null = "https://graph.microsoft.com/v1.0/sites/getAllSites?$top=999&$select=id,displayName,webUrl";
  while (nextLink) {
    const data = await graphGet(token, nextLink);
    if (!data) break;
    sites.push(...(data.value || []));
    nextLink = data["@odata.nextLink"] || null;
  }
  if (sites.length > 0) return sites;

  // Fallback: search=*
  nextLink = "https://graph.microsoft.com/v1.0/sites?search=*&$top=999&$select=id,displayName,webUrl";
  while (nextLink) {
    const data = await graphGet(token, nextLink);
    if (!data) break;
    sites.push(...(data.value || []));
    nextLink = data["@odata.nextLink"] || null;
  }
  return sites;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getGraphToken();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body = phase 1 */ }

    const siteDbId = body?.site_db_id;

    // ─── PHASE 2: Sync folders for a specific site ───
    if (siteDbId) {
      // Get site_id from DB
      const { data: siteRow, error: siteErr } = await supabase
        .from("sharepoint_sites")
        .select("site_id")
        .eq("id", siteDbId)
        .single();
      if (siteErr || !siteRow) {
        return new Response(JSON.stringify({ error: "Site not found in DB" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let pastasUpserted = 0;
      const graphSiteId = siteRow.site_id;

      // List drives
      const drivesData = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drives?$select=id,name`);
      if (drivesData?.value) {
        for (const drive of drivesData.value) {
          // L1 folders
          const rootChildren = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$filter=folder ne null&$select=id,name&$top=200`);
          if (!rootChildren?.value) continue;

          for (const folder1 of rootChildren.value) {
            const caminho1 = `${drive.name}/${folder1.name}`;
            const driveItemId1 = `${drive.id}:${folder1.id}`;

            const { data: pasta1Row } = await supabase
              .from("sharepoint_pastas")
              .upsert({ site_db_id: siteDbId, drive_item_id: driveItemId1, nome: folder1.name, caminho: caminho1, parent_id: null }, { onConflict: "drive_item_id" })
              .select("id")
              .single();

            let pasta1Id: string;
            if (pasta1Row) {
              pasta1Id = pasta1Row.id;
              pastasUpserted++;
            } else {
              const { data: existing } = await supabase.from("sharepoint_pastas").select("id").eq("drive_item_id", driveItemId1).single();
              if (!existing) continue;
              await supabase.from("sharepoint_pastas").update({ nome: folder1.name, caminho: caminho1, site_db_id: siteDbId }).eq("id", existing.id);
              pasta1Id = existing.id;
              pastasUpserted++;
            }

            // L2 folders
            const l2Children = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${folder1.id}/children?$filter=folder ne null&$select=id,name&$top=200`);
            if (!l2Children?.value) continue;

            for (const folder2 of l2Children.value) {
              const caminho2 = `${caminho1}/${folder2.name}`;
              const driveItemId2 = `${drive.id}:${folder2.id}`;
              const { error: p2Err } = await supabase
                .from("sharepoint_pastas")
                .upsert({ site_db_id: siteDbId, drive_item_id: driveItemId2, nome: folder2.name, caminho: caminho2, parent_id: pasta1Id }, { onConflict: "drive_item_id" });
              if (!p2Err) pastasUpserted++;
            }
          }
        }
      }

      return new Response(JSON.stringify({ site_db_id: siteDbId, pastas: pastasUpserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PHASE 1: Sync all sites (metadata only, no folders) ───
    const sites = await listAllSites(token);
    console.log(`Phase 1: ${sites.length} sites found`);

    if (sites.length === 0) {
      return new Response(JSON.stringify({ error: "No sites found", hint: "Check Microsoft Graph permissions" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out personal OneDrive sites (-my.sharepoint.com)
    const corporateSites = sites.filter((s: any) => !s.webUrl || !s.webUrl.includes("-my.sharepoint.com"));
    console.log(`Phase 1: ${corporateSites.length} corporate sites (filtered ${sites.length - corporateSites.length} personal)`);

    // Batch upsert in groups of 500
    const BATCH = 500;
    let upserted = 0;
    for (let i = 0; i < corporateSites.length; i += BATCH) {
      const batch = corporateSites.slice(i, i + BATCH).map((s: any) => ({
        site_id: s.id,
        nome: s.displayName || s.id,
        url: s.webUrl,
      }));
      const { error } = await supabase
        .from("sharepoint_sites")
        .upsert(batch, { onConflict: "site_id" });
      if (error) { console.error("Batch upsert error:", error); }
      else { upserted += batch.length; }
    }

    return new Response(JSON.stringify({ sites: upserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-sharepoint-sites error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
