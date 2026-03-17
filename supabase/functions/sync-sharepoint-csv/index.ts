import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Azure credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Get Azure AD token
    console.log("Authenticating with Azure AD...");
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Azure auth failed: ${tokenRes.status} ${err}`);
    }
    const { access_token } = await tokenRes.json();
    console.log("Azure AD token acquired");

    const graphHeaders = {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    };

    // 2. Resolve SharePoint site ID
    console.log("Resolving SharePoint site...");
    const siteRes = await fetch(
      "https://graph.microsoft.com/v1.0/sites/origoenergia.sharepoint.com:/sites/dataanalytics",
      { headers: graphHeaders }
    );
    if (!siteRes.ok) {
      const err = await siteRes.text();
      throw new Error(`Site resolution failed: ${siteRes.status} ${err}`);
    }
    const site = await siteRes.json();
    const siteId = site.id;
    console.log(`Site resolved: ${siteId}`);

    // 3. List files in RH_COLAB folder
    console.log("Listing files in RH_COLAB...");
    const filesRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/RH_COLAB:/children?$orderby=lastModifiedDateTime desc&$top=50`,
      { headers: graphHeaders }
    );
    if (!filesRes.ok) {
      const err = await filesRes.text();
      throw new Error(`Folder listing failed: ${filesRes.status} ${err}`);
    }
    const filesData = await filesRes.json();
    const files = filesData.value || [];

    // 4. Find most recent CSV with prefix base_colab_
    const csvFiles = files.filter(
      (f: any) =>
        f.name &&
        f.name.toLowerCase().startsWith("base_colab_") &&
        f.name.toLowerCase().endsWith(".csv")
    );

    if (csvFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No CSV files found with prefix base_colab_ in RH_COLAB folder" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already sorted by lastModifiedDateTime desc, take first
    const latestFile = csvFiles[0];
    console.log(`Latest CSV: ${latestFile.name} (modified: ${latestFile.lastModifiedDateTime})`);

    // 5. Download the CSV content
    const downloadUrl = latestFile["@microsoft.graph.downloadUrl"];
    let csvContent: Uint8Array;

    if (downloadUrl) {
      const dlRes = await fetch(downloadUrl);
      if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
      csvContent = new Uint8Array(await dlRes.arrayBuffer());
    } else {
      // Fallback: use content endpoint
      const dlRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${latestFile.id}/content`,
        { headers: graphHeaders }
      );
      if (!dlRes.ok) throw new Error(`Download via content failed: ${dlRes.status}`);
      csvContent = new Uint8Array(await dlRes.arrayBuffer());
    }
    console.log(`Downloaded ${csvContent.length} bytes`);

    // 6. Forward CSV to sync-csv-colab edge function
    console.log("Forwarding to sync-csv-colab...");
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, latestFile.name);

    const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/sync-csv-colab`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: formData,
    });

    const syncBody = await syncRes.text();
    console.log(`sync-csv-colab responded: ${syncRes.status}`);

    return new Response(
      JSON.stringify({
        success: syncRes.ok,
        file: latestFile.name,
        modified: latestFile.lastModifiedDateTime,
        size: csvContent.length,
        syncStatus: syncRes.status,
        syncResponse: syncBody,
      }),
      {
        status: syncRes.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
