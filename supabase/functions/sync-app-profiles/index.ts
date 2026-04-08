import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

/**
 * Obtain an OAuth 2.0 access token using client_credentials grant.
 */
async function getOAuth2Token(config: Record<string, any>): Promise<string> {
  const tokenUrl = config.token_url;
  if (!tokenUrl) throw new Error("token_url não configurada para OAuth 2.0");
  const params: Record<string, string> = {
    client_id: config.oauth_client_id || "",
    client_secret: config.oauth_client_secret || "",
    grant_type: "client_credentials",
  };
  if (config.oauth_scope) params.scope = config.oauth_scope;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token failed (${res.status}): ${text.substring(0, 500)}`);
  }
  const { access_token } = await res.json();
  if (!access_token) throw new Error("OAuth2 response sem access_token");
  return access_token;
}

/**
 * Fetch profiles/roles from an external app via its connector config.
 * Supports: rest_api (generic REST GET), scim (SCIM /Roles or /Groups).
 * For 'manual' or 'entra' connector types, returns empty (managed elsewhere).
 */
async function fetchExternalProfiles(
  connectorType: string,
  config: Record<string, any>
): Promise<{ id: string; name: string; description?: string }[]> {
  if (!config?.base_url) throw new Error("base_url não configurada no conector");

  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };

  // Build auth headers based on auth_type
  switch (config.auth_type) {
    case "bearer":
      if (config.api_token) authHeaders["Authorization"] = `Bearer ${config.api_token}`;
      break;
    case "basic": {
      const encoded = btoa(`${config.username || ""}:${config.password || ""}`);
      authHeaders["Authorization"] = `Basic ${encoded}`;
      break;
    }
    case "api_key":
      if (config.api_key_header && config.api_key_value) {
        authHeaders[config.api_key_header] = config.api_key_value;
      }
      break;
    case "app_token":
      if (config.app_token) authHeaders["App-Token"] = config.app_token;
      if (config.session_token) authHeaders["Session-Token"] = config.session_token;
      break;
    case "oauth2_client_credentials": {
      const token = await getOAuth2Token(config);
      authHeaders["Authorization"] = `Bearer ${token}`;
      break;
    }
  }

  // Add custom headers
  if (config.custom_headers && typeof config.custom_headers === "object") {
    Object.assign(authHeaders, config.custom_headers);
  }

  if (connectorType === "rest_api") {
    const endpoint = config.profiles_endpoint || "/profiles";
    const url = `${config.base_url.replace(/\/$/, "")}${endpoint}`;
    console.log(`[sync-app-profiles] REST GET ${url}`);

    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API retornou ${res.status}: ${errText.substring(0, 500)}`);
    }

    const body = await res.json();

    // Try to extract profiles from common response shapes
    const items = Array.isArray(body)
      ? body
      : body.data
      ? body.data
      : body.results
      ? body.results
      : body.value
      ? body.value
      : body.Resources
      ? body.Resources
      : [];

    // Map fields using config or defaults
    const idField = config.profile_id_field || "id";
    const nameField = config.profile_name_field || "name";
    const descField = config.profile_desc_field || "description";

    return items.map((item: any) => ({
      id: String(item[idField] || item.id || ""),
      name: String(item[nameField] || item.name || item.displayName || ""),
      description: item[descField] || item.comment || undefined,
    }));
  }

  if (connectorType === "scim") {
    const endpoint = config.profiles_endpoint || "/Roles";
    const url = `${config.base_url.replace(/\/$/, "")}${endpoint}`;
    console.log(`[sync-app-profiles] SCIM GET ${url}`);

    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SCIM retornou ${res.status}: ${errText.substring(0, 500)}`);
    }

    const body = await res.json();
    const resources = body.Resources || body.data || [];

    return resources.map((r: any) => ({
      id: r.id || r.value || "",
      name: r.displayName || r.name || "",
      description: r.description || undefined,
    }));
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const aplicacaoId = body?.aplicacao_id;
    if (!aplicacaoId) return jsonResponse({ error: "aplicacao_id obrigatório" }, 400);

    // Fetch app with connector config
    const { data: app, error: appErr } = await supabase
      .from("aplicacoes")
      .select("id, nome, connector_type, connector_config")
      .eq("id", aplicacaoId)
      .single();

    if (appErr || !app) return jsonResponse({ error: "Aplicação não encontrada" }, 404);

    const connType = (app as any).connector_type || "manual";
    const connConfig = (app as any).connector_config as Record<string, any> | null;

    if (connType === "manual" || connType === "entra") {
      return jsonResponse({ error: `Tipo de conector '${connType}' não suporta sincronização automática de perfis. Cadastre manualmente.` }, 400);
    }

    if (!connConfig) {
      return jsonResponse({ error: "Configuração do conector não encontrada" }, 400);
    }

    // Fetch external profiles
    const profiles = await fetchExternalProfiles(connType, connConfig);
    console.log(`[sync-app-profiles] Fetched ${profiles.length} profiles from ${app.nome}`);

    // Upsert into aplicacao_perfis_internos
    let created = 0;
    let updated = 0;

    for (const p of profiles) {
      if (!p.name) continue;

      // Check if exists
      const { data: existing } = await supabase
        .from("aplicacao_perfis_internos")
        .select("id")
        .eq("aplicacao_id", aplicacaoId)
        .eq("external_id", p.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("aplicacao_perfis_internos")
          .update({ nome_externo: p.name, descricao: p.description || null, ativo: true })
          .eq("id", existing.id);
        updated++;
      } else {
        await supabase
          .from("aplicacao_perfis_internos")
          .insert({
            aplicacao_id: aplicacaoId,
            nome_externo: p.name,
            external_id: p.id,
            descricao: p.description || null,
          });
        created++;
      }
    }

    return jsonResponse({
      success: true,
      app: app.nome,
      total: profiles.length,
      created,
      updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[sync-app-profiles] Error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
