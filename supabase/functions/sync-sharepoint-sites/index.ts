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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getGraphToken();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. List all sites
    let sites: any[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/v1.0/sites?search=*&$top=100&$select=id,displayName,webUrl";
    while (nextLink) {
      const data = await graphGet(token, nextLink);
      if (!data) break;
      sites.push(...(data.value || []));
      nextLink = data["@odata.nextLink"] || null;
    }
    console.log(`Found ${sites.length} sites`);

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

      // 2. List drives for the site
      const drivesData = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${site.id}/drives?$select=id,name`);
      if (!drivesData?.value) continue;

      for (const drive of drivesData.value) {
        // 3. List root children (level 1 folders)
        const rootChildren = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$filter=folder ne null&$select=id,name,parentReference&$top=200`);
        if (!rootChildren?.value) continue;

        for (const folder1 of rootChildren.value) {
          // Upsert level 1 folder
          const caminho1 = `${drive.name}/${folder1.name}`;
          const { data: pasta1Row, error: p1Err } = await supabase
            .from("sharepoint_pastas")
            .upsert(
              { site_db_id: siteDbId, drive_item_id: `${drive.id}:${folder1.id}`, nome: folder1.name, caminho: caminho1, parent_id: null },
              { onConflict: "drive_item_id", ignoreDuplicates: false }
            )
            .select("id")
            .single();
          
          if (p1Err) {
            // If upsert fails due to missing unique constraint, try insert/select
            const { data: existing } = await supabase.from("sharepoint_pastas").select("id").eq("drive_item_id", `${drive.id}:${folder1.id}`).single();
            if (!existing) { console.error(`Pasta L1 error:`, p1Err); continue; }
            // Update existing
            await supabase.from("sharepoint_pastas").update({ nome: folder1.name, caminho: caminho1 }).eq("id", existing.id);
            const pasta1Id = existing.id;
            pastasUpserted++;

            // Level 2 folders
            const l2Children = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${folder1.id}/children?$filter=folder ne null&$select=id,name&$top=200`);
            if (l2Children?.value) {
              for (const folder2 of l2Children.value) {
                const caminho2 = `${caminho1}/${folder2.name}`;
                const { error: p2Err } = await supabase
                  .from("sharepoint_pastas")
                  .upsert(
                    { site_db_id: siteDbId, drive_item_id: `${drive.id}:${folder2.id}`, nome: folder2.name, caminho: caminho2, parent_id: pasta1Id },
                    { onConflict: "drive_item_id", ignoreDuplicates: false }
                  );
                if (!p2Err) pastasUpserted++;
              }
            }
            continue;
          }

          pastasUpserted++;
          const pasta1Id = pasta1Row.id;

          // 4. List level 2 folders
          const l2Children = await graphGet(token, `https://graph.microsoft.com/v1.0/drives/${drive.id}/items/${folder1.id}/children?$filter=folder ne null&$select=id,name&$top=200`);
          if (!l2Children?.value) continue;

          for (const folder2 of l2Children.value) {
            const caminho2 = `${caminho1}/${folder2.name}`;
            const { error: p2Err } = await supabase
              .from("sharepoint_pastas")
              .upsert(
                { site_db_id: siteDbId, drive_item_id: `${drive.id}:${folder2.id}`, nome: folder2.name, caminho: caminho2, parent_id: pasta1Id },
                { onConflict: "drive_item_id", ignoreDuplicates: false }
              );
            if (!p2Err) pastasUpserted++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ sites: sitesUpserted, pastas: pastasUpserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-sharepoint-sites error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
