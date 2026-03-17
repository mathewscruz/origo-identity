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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = await getAccessToken();

    // ── Sync Users ──
    const usersUrl = `${GRAPH_BASE}/users?$select=id,displayName,mail,employeeId,jobTitle,department,accountEnabled&$top=999`;
    const users = await fetchAllPages<GraphUser>(usersUrl, token);

    let usersCreated = 0;
    let usersUpdated = 0;

    for (const user of users) {
      const status = user.accountEnabled ? "ativo" : "inativo";

      const { data: existing } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("entra_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("colaboradores")
          .update({
            nome: user.displayName,
            email: user.mail,
            matricula: user.employeeId,
            status,
            origem: "entra_id",
          })
          .eq("entra_id", user.id);
        usersUpdated++;
      } else {
        await supabase.from("colaboradores").insert({
          entra_id: user.id,
          nome: user.displayName,
          email: user.mail,
          matricula: user.employeeId,
          status,
          origem: "entra_id",
        });
        usersCreated++;
      }
    }

    // ── Sync Applications ──
    const appsUrl = `${GRAPH_BASE}/applications?$select=id,displayName,signInAudience&$top=999`;
    const apps = await fetchAllPages<GraphApp>(appsUrl, token);

    let appsCreated = 0;
    let appsUpdated = 0;

    for (const app of apps) {
      const { data: existing } = await supabase
        .from("aplicacoes")
        .select("id")
        .eq("entra_id", app.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("aplicacoes")
          .update({
            nome: app.displayName,
            tipo_auth: app.signInAudience || null,
          })
          .eq("entra_id", app.id);
        appsUpdated++;
      } else {
        await supabase.from("aplicacoes").insert({
          entra_id: app.id,
          nome: app.displayName,
          tipo_auth: app.signInAudience || null,
          criticidade: "media",
        });
        appsCreated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        users: { total: users.length, created: usersCreated, updated: usersUpdated },
        apps: { total: apps.length, created: appsCreated, updated: appsUpdated },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("sync-entra-id error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
