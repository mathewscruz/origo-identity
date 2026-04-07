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

    console.log("[sync-entra-licencas] Starting license sync...");
    const token = await getAzureToken(tenantId, clientId, clientSecret);

    // Fetch all subscribed SKUs (licenses)
    const res = await fetch("https://graph.microsoft.com/v1.0/subscribedSkus", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API error (${res.status}): ${text}`);
    }
    const json = await res.json();
    const skus = json.value || [];
    console.log(`[sync-entra-licencas] Fetched ${skus.length} SKUs from Microsoft`);

    // Get existing licenses from DB
    const { data: existing } = await supabase.from("entra_licencas").select("id, sku_id");
    const existingBySkuId = new Map((existing || []).map((l: any) => [l.sku_id, l.id]));

    const validSkuIds = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const sku of skus) {
      // Skip disabled/suspended SKUs with 0 total
      const total = sku.prepaidUnits?.enabled || 0;
      const emUso = sku.consumedUnits || 0;
      const skuId = sku.skuId;
      const nome = sku.skuPartNumber || sku.skuId;

      validSkuIds.add(skuId);

      if (existingBySkuId.has(skuId)) {
        // Update existing
        await supabase.from("entra_licencas").update({
          nome,
          total,
          em_uso: emUso,
          updated_at: new Date().toISOString(),
        }).eq("id", existingBySkuId.get(skuId));
        updated++;
      } else {
        // Insert new
        const { error } = await supabase.from("entra_licencas").insert({
          sku_id: skuId,
          nome,
          total,
          em_uso: emUso,
        });
        if (error) {
          console.error(`[sync-entra-licencas] Error inserting ${nome}:`, error.message);
        } else {
          created++;
        }
      }
    }

    // Cleanup: remove licenses no longer in tenant
    let deleted = 0;
    const stale = (existing || []).filter((l: any) => !validSkuIds.has(l.sku_id));
    if (stale.length > 0) {
      const ids = stale.map((l: any) => l.id);
      const { error } = await supabase.from("entra_licencas").delete().in("id", ids);
      if (!error) deleted = stale.length;
    }

    // Generate alerts for critical licenses (>90% usage)
    const criticalSkus = skus.filter((sku: any) => {
      const t = sku.prepaidUnits?.enabled || 0;
      const u = sku.consumedUnits || 0;
      return t > 0 && (u / t) >= 0.9;
    });
    for (const sku of criticalSkus) {
      const nome = sku.skuPartNumber || sku.skuId;
      const t = sku.prepaidUnits?.enabled || 0;
      const u = sku.consumedUnits || 0;
      await supabase.from("alertas").insert({
        titulo: `Licença crítica: ${nome}`,
        mensagem: `A licença ${nome} está com ${u}/${t} unidades em uso (${Math.round((u/t)*100)}%)`,
        severidade: "aviso",
        tipo: "licenca_critica",
      });
    }
    if (criticalSkus.length > 0) {
      console.log(`[sync-entra-licencas] ${criticalSkus.length} license(s) above 90% usage`);
    }

    const summary = { total: skus.length, created, updated, deleted };
    console.log("[sync-entra-licencas] Sync complete:", summary);
    return jsonResponse(summary);
  } catch (err) {
    console.error("[sync-entra-licencas] Error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});
