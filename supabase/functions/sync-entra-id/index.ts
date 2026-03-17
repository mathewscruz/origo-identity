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

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Azure credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Azure token [${res.status}]: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchAllPages<T>(url: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Graph API error [${res.status}]: ${err}`);
    }
    const data = await res.json();
    items.push(...(data.value || []));
    nextUrl = data["@odata.nextLink"] || null;
  }

  return items;
}

interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  employeeId: string | null;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
}

interface GraphApp {
  id: string;
  displayName: string;
  signInAudience: string | null;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(sseEvent(data))); } catch { /* stream closed */ }
      };

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      // Create a sync job record
      let jobId: string | null = null;
      try {
        const { data: job } = await supabase
          .from("sync_jobs")
          .insert({ status: "running", phase: "auth", message: "Autenticando no Entra ID..." })
          .select("id")
          .single();
        jobId = job?.id ?? null;
      } catch { /* table may not exist yet */ }

      const updateJob = async (updates: Record<string, unknown>) => {
        if (!jobId) return;
        try {
          await supabase.from("sync_jobs").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", jobId);
        } catch { /* ignore */ }
      };

      try {
        send({ phase: "auth", message: "Autenticando no Entra ID..." });
        const token = await getAccessToken();

        // ── Fetch Users ──
        send({ phase: "fetch_users", message: "Buscando usuários do Entra ID..." });
        await updateJob({ phase: "fetch_users", message: "Buscando usuários do Entra ID..." });
        const usersUrl = `${GRAPH_BASE}/users?$select=id,displayName,mail,employeeId,jobTitle,department,accountEnabled&$top=999`;
        const users = await fetchAllPages<GraphUser>(usersUrl, token);
        send({ phase: "fetch_users_done", totalUsers: users.length, message: `${users.length} usuários encontrados` });
        await updateJob({ phase: "fetch_users_done", message: `${users.length} usuários encontrados`, users_total: users.length });

        // ── Fetch Apps ──
        send({ phase: "fetch_apps", message: "Buscando aplicações do Entra ID..." });
        await updateJob({ phase: "fetch_apps", message: "Buscando aplicações do Entra ID..." });
        const appsUrl = `${GRAPH_BASE}/applications?$select=id,displayName,signInAudience&$top=999`;
        const apps = await fetchAllPages<GraphApp>(appsUrl, token);
        send({ phase: "fetch_apps_done", totalApps: apps.length, message: `${apps.length} aplicações encontradas` });
        await updateJob({ phase: "fetch_apps_done", message: `${apps.length} aplicações encontradas`, apps_total: apps.length });

        // ── Sync Users ──
        let usersCreated = 0;
        let usersUpdated = 0;

        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          const status = user.accountEnabled ? "ativo" : "inativo";

          const { data: existing } = await supabase
            .from("colaboradores")
            .select("id")
            .eq("entra_id", user.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("colaboradores")
              .update({ nome: user.displayName, email: user.mail, matricula: user.employeeId, status, origem: "entra_id" })
              .eq("entra_id", user.id);
            usersUpdated++;
          } else {
            await supabase.from("colaboradores").insert({
              entra_id: user.id, nome: user.displayName, email: user.mail, matricula: user.employeeId, status, origem: "entra_id",
            });
            usersCreated++;
          }

          if ((i + 1) % 10 === 0 || i === users.length - 1) {
            const percent = Math.round(((i + 1) / users.length) * 100);
            send({
              phase: "sync_users",
              current: i + 1,
              total: users.length,
              percent,
              created: usersCreated,
              updated: usersUpdated,
            });
            await updateJob({
              phase: "sync_users",
              message: `Sincronizando usuários: ${i + 1}/${users.length}`,
              users_percent: percent,
              users_created: usersCreated,
              users_updated: usersUpdated,
            });
          }
        }

        // ── Sync Apps ──
        let appsCreated = 0;
        let appsUpdated = 0;

        for (let i = 0; i < apps.length; i++) {
          const app = apps[i];

          const { data: existing } = await supabase
            .from("aplicacoes")
            .select("id")
            .eq("entra_id", app.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("aplicacoes")
              .update({ nome: app.displayName, tipo_auth: app.signInAudience || null })
              .eq("entra_id", app.id);
            appsUpdated++;
          } else {
            await supabase.from("aplicacoes").insert({
              entra_id: app.id, nome: app.displayName, tipo_auth: app.signInAudience || null, criticidade: "media",
            });
            appsCreated++;
          }

          if ((i + 1) % 10 === 0 || i === apps.length - 1) {
            const percent = Math.round(((i + 1) / apps.length) * 100);
            send({
              phase: "sync_apps",
              current: i + 1,
              total: apps.length,
              percent,
              created: appsCreated,
              updated: appsUpdated,
            });
            await updateJob({
              phase: "sync_apps",
              message: `Sincronizando aplicações: ${i + 1}/${apps.length}`,
              apps_percent: percent,
              apps_created: appsCreated,
              apps_updated: appsUpdated,
            });
          }
        }

        send({
          phase: "done",
          success: true,
          users: { total: users.length, created: usersCreated, updated: usersUpdated },
          apps: { total: apps.length, created: appsCreated, updated: appsUpdated },
        });
        await updateJob({
          status: "done",
          phase: "done",
          message: "Sincronização concluída!",
          users_percent: 100,
          apps_percent: 100,
          users_created: usersCreated,
          users_updated: usersUpdated,
          apps_created: appsCreated,
          apps_updated: appsUpdated,
        });
      } catch (error: unknown) {
        console.error("sync-entra-id error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        send({ phase: "error", success: false, error: message });
        await updateJob({ status: "error", phase: "error", error: message, message: `Erro: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
