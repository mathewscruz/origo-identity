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

async function fetchAllPages<T>(url: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph API error [${res.status}]: ${await res.text()}`);
    const data = await res.json();
    items.push(...(data.value || []));
    nextUrl = data["@odata.nextLink"] || null;
  }
  return items;
}

interface GraphApp { id: string; displayName: string; signInAudience: string | null; }

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

        send({ phase: "fetch_apps", message: "Buscando aplicações do Entra ID..." });
        await updateJob({ phase: "fetch_apps", message: "Buscando aplicações..." });
        const apps = await fetchAllPages<GraphApp>(`${GRAPH_BASE}/applications?$select=id,displayName,signInAudience&$top=999`, token);
        send({ phase: "fetch_apps_done", totalApps: apps.length, message: `${apps.length} aplicações encontradas` });
        await updateJob({ phase: "fetch_apps_done", message: `${apps.length} aplicações encontradas`, apps_total: apps.length });

        let created = 0, updated = 0;
        for (let i = 0; i < apps.length; i++) {
          const app = apps[i];
          const { data: existing } = await supabase.from("aplicacoes").select("id").eq("entra_id", app.id).maybeSingle();
          if (existing) {
            await supabase.from("aplicacoes").update({ nome: app.displayName, tipo_auth: app.signInAudience || null }).eq("entra_id", app.id);
            updated++;
          } else {
            await supabase.from("aplicacoes").insert({ entra_id: app.id, nome: app.displayName, tipo_auth: app.signInAudience || null, criticidade: "media" });
            created++;
          }
          if ((i + 1) % 10 === 0 || i === apps.length - 1) {
            const percent = Math.round(((i + 1) / apps.length) * 100);
            send({ phase: "sync_apps", current: i + 1, total: apps.length, percent, created, updated });
            await updateJob({ phase: "sync_apps", message: `Sincronizando: ${i + 1}/${apps.length}`, apps_percent: percent, apps_created: created, apps_updated: updated });
          }
        }

        send({ phase: "done", success: true, apps: { total: apps.length, created, updated } });
        await updateJob({ status: "done", phase: "done", message: "Concluído!", apps_percent: 100, apps_created: created, apps_updated: updated });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send({ phase: "error", success: false, error: message });
        await updateJob({ status: "error", phase: "error", error: message, message: `Erro: ${message}` });
      } finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});
