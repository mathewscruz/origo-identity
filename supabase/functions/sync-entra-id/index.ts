import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) throw new Error("Missing Azure credentials");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default" }).toString(),
  });
  if (!res.ok) throw new Error(`Azure token error [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token;
}

interface GraphApp { id: string; displayName: string; signInAudience: string | null; }
interface GraphSku { skuId: string; skuPartNumber: string; prepaidUnits: { enabled: number }; consumedUnits: number; }
interface GraphGroup { id: string; displayName: string; description: string | null; }

function sseEvent(data: Record<string, unknown>): string { return `data: ${JSON.stringify(data)}\n\n`; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => { try { controller.enqueue(encoder.encode(sseEvent(data))); } catch { /* */ } };
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      let jobId: string | null = null;
      try {
        const { data: job } = await supabase.from("sync_jobs").insert({ status: "running", tipo: "entra_apps", phase: "auth", message: "Autenticando no Entra ID..." }).select("id").single();
        jobId = job?.id ?? null;
      } catch { /* */ }

      const updateJob = async (updates: Record<string, unknown>) => { if (jobId) try { await supabase.from("sync_jobs").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", jobId); } catch { /* */ } };

      try {
        send({ phase: "auth", message: "Autenticando..." });
        const token = await getAccessToken();

        // ===== APPS (page-by-page) =====
        send({ phase: "fetch_apps", message: "Buscando aplicações do Entra ID..." });
        await updateJob({ phase: "fetch_apps", message: "Buscando aplicações..." });

        let appsCreated = 0, appsUpdated = 0, appsTotal = 0;
        let appsNextUrl: string | null = `${GRAPH_BASE}/applications?$select=id,displayName,signInAudience&$top=999`;
        let appsPage = 0;

        while (appsNextUrl) {
          const res = await fetch(appsNextUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`Graph API apps error [${res.status}]: ${await res.text()}`);
          const data = await res.json();
          const apps: GraphApp[] = data.value || [];
          appsPage++;

          for (const app of apps) {
            const { data: existing } = await supabase.from("aplicacoes").select("id").eq("entra_id", app.id).maybeSingle();
            if (existing) {
              await supabase.from("aplicacoes").update({ nome: app.displayName, tipo_auth: app.signInAudience || null }).eq("entra_id", app.id);
              appsUpdated++;
            } else {
              await supabase.from("aplicacoes").insert({ entra_id: app.id, nome: app.displayName, tipo_auth: app.signInAudience || null, criticidade: "media" });
              appsCreated++;
            }
          }
          appsTotal += apps.length;

          send({ phase: "sync_apps", synced: appsTotal, page: appsPage, created: appsCreated, updated: appsUpdated, message: `${appsTotal} aplicações sincronizadas...` });
          await updateJob({ phase: "sync_apps", message: `Sincronizando apps: ${appsTotal}`, apps_total: appsTotal, apps_created: appsCreated, apps_updated: appsUpdated });

          appsNextUrl = data["@odata.nextLink"] || null;
        }

        send({ phase: "apps_done", total: appsTotal, created: appsCreated, updated: appsUpdated, message: `${appsTotal} aplicações concluídas` });
        await updateJob({ phase: "apps_done", message: `${appsTotal} aplicações concluídas`, apps_percent: 100, apps_total: appsTotal, apps_created: appsCreated, apps_updated: appsUpdated });

        // ===== LICENÇAS (subscribedSkus — single page) =====
        send({ phase: "fetch_licencas", message: "Buscando licenças Microsoft..." });
        await updateJob({ phase: "fetch_licencas", message: "Buscando licenças..." });
        let licencasSynced = 0;
        try {
          const skuRes = await fetch(`${GRAPH_BASE}/subscribedSkus`, { headers: { Authorization: `Bearer ${token}` } });
          if (!skuRes.ok) throw new Error(`subscribedSkus error [${skuRes.status}]`);
          const skuData = await skuRes.json();
          const skus: GraphSku[] = skuData.value || [];
          
          for (const sku of skus) {
            const { data: existing } = await supabase.from("entra_licencas").select("id").eq("sku_id", sku.skuId).maybeSingle();
            const payload = { 
              sku_id: sku.skuId, 
              nome: sku.skuPartNumber, 
              total: sku.prepaidUnits?.enabled ?? 0, 
              em_uso: sku.consumedUnits ?? 0,
              updated_at: new Date().toISOString(),
            };
            if (existing) {
              await supabase.from("entra_licencas").update(payload).eq("id", existing.id);
            } else {
              await supabase.from("entra_licencas").insert(payload);
            }
            licencasSynced++;
          }
          send({ phase: "licencas_done", total: licencasSynced, message: `${licencasSynced} licenças sincronizadas` });
          await updateJob({ phase: "licencas_done", message: `${licencasSynced} licenças sincronizadas` });
        } catch (licErr: unknown) {
          const msg = licErr instanceof Error ? licErr.message : "Erro ao buscar licenças";
          send({ phase: "licencas_error", message: msg });
          await updateJob({ message: `Licenças: ${msg}` });
        }

        // ===== GRUPOS (page-by-page) =====
        send({ phase: "fetch_grupos", message: "Buscando grupos do Entra ID..." });
        await updateJob({ phase: "fetch_grupos", message: "Buscando grupos..." });
        let gruposTotal = 0;
        let gruposPage = 0;
        try {
          let gruposNextUrl: string | null = `${GRAPH_BASE}/groups?$select=id,displayName,description&$top=999`;

          while (gruposNextUrl) {
            const res = await fetch(gruposNextUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Graph API groups error [${res.status}]: ${await res.text()}`);
            const data = await res.json();
            const groups: GraphGroup[] = data.value || [];
            gruposPage++;

            for (const g of groups) {
              const { data: existing } = await supabase.from("entra_grupos").select("id").eq("entra_id", g.id).maybeSingle();
              const payload = {
                entra_id: g.id,
                nome: g.displayName,
                descricao: g.description || null,
                updated_at: new Date().toISOString(),
              };
              if (existing) {
                await supabase.from("entra_grupos").update(payload).eq("id", existing.id);
              } else {
                await supabase.from("entra_grupos").insert(payload);
              }
            }
            gruposTotal += groups.length;

            send({ phase: "sync_grupos", synced: gruposTotal, page: gruposPage, message: `${gruposTotal} grupos sincronizados...` });
            await updateJob({ phase: "sync_grupos", message: `Sincronizando grupos: ${gruposTotal}` });

            gruposNextUrl = data["@odata.nextLink"] || null;
          }

          send({ phase: "grupos_done", total: gruposTotal, message: `${gruposTotal} grupos sincronizados` });
          await updateJob({ phase: "grupos_done", message: `${gruposTotal} grupos sincronizados` });
        } catch (grpErr: unknown) {
          const msg = grpErr instanceof Error ? grpErr.message : "Erro ao buscar grupos";
          send({ phase: "grupos_error", message: msg });
          await updateJob({ message: `Grupos: ${msg}` });
        }

        send({ phase: "done", success: true, apps: { total: appsTotal, created: appsCreated, updated: appsUpdated }, licencas: licencasSynced, grupos: gruposTotal });
        await updateJob({ status: "done", phase: "done", message: "Concluído!", apps_percent: 100, apps_created: appsCreated, apps_updated: appsUpdated });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send({ phase: "error", success: false, error: message });
        await updateJob({ status: "error", phase: "error", error: message, message: `Erro: ${message}` });
      } finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});
