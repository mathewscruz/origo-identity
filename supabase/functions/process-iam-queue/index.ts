import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ENTRA_ACTION_TYPES = [
  "assign_group", "remove_group",
  "assign_license", "remove_license",
  "assign_app", "remove_app",
  "disable_entra", "enable_entra",
  "update_entra",
];

const EXTERNAL_APP_ACTION_TYPES = [
  "create_user_app", "update_user_app",
  "disable_user_app", "delete_user_app",
];

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

async function resolveUserId(
  token: string,
  email: string | null,
  samAccountName: string | null
): Promise<{ userId: string | null; resolvedBy: string }> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (email) {
    const safeEmail = email.replace(/'/g, "''");
    const filterUrl = `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${safeEmail}' or userPrincipalName eq '${safeEmail}'&$select=id,displayName,mail,userPrincipalName`;
    try {
      const res = await fetch(filterUrl, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.value && data.value.length > 0) {
          console.log(`[resolveUserId] Found user by email: ${email} → ${data.value[0].id}`);
          return { userId: data.value[0].id, resolvedBy: `email:${email}` };
        }
      } else {
        const errText = await res.text();
        console.warn(`[resolveUserId] Graph filter by email failed (${res.status}): ${errText}`);
      }
    } catch (e) {
      console.warn(`[resolveUserId] Error searching by email:`, e);
    }
  }

  if (samAccountName) {
    const safeSam = samAccountName.replace(/'/g, "''");
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users?$filter=onPremisesSamAccountName eq '${safeSam}'&$select=id,displayName,mail`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.value && data.value.length > 0) {
          console.log(`[resolveUserId] Found user by SAM: ${samAccountName} → ${data.value[0].id}`);
          return { userId: data.value[0].id, resolvedBy: `sam:${samAccountName}` };
        }
      }
    } catch { /* skip */ }
  }

  return { userId: null, resolvedBy: `not_found (email: ${email || "N/A"}, sam: ${samAccountName || "N/A"})` };
}

async function resolveServicePrincipal(
  headers: Record<string, string>,
  graphBase: string,
  idValue: string,
  context: string
): Promise<string | null> {
  console.log(`[${context}] Resolving SP for ID: ${idValue}`);

  try {
    const directRes = await fetch(`${graphBase}/servicePrincipals/${idValue}?$select=id,displayName,appId`, { headers });
    if (directRes.ok) {
      const sp = await directRes.json();
      console.log(`[${context}] ✅ Strategy 1 - Direct SP lookup succeeded: ${idValue} → ${sp.displayName}`);
      return sp.id;
    }
    const errText = await directRes.text();
    console.log(`[${context}] Strategy 1 failed (${directRes.status}): ${errText.substring(0, 200)}`);
  } catch (e) {
    console.warn(`[${context}] Strategy 1 error:`, e);
  }

  try {
    const filterRes = await fetch(
      `${graphBase}/servicePrincipals?$filter=appId eq '${idValue}'&$select=id,displayName,appId`,
      { headers }
    );
    if (filterRes.ok) {
      const data = await filterRes.json();
      if (data.value && data.value.length > 0) {
        console.log(`[${context}] ✅ Strategy 2 - appId filter succeeded: ${idValue} → SP ${data.value[0].id}`);
        return data.value[0].id;
      }
      console.log(`[${context}] Strategy 2 returned 0 results`);
    } else {
      const errText = await filterRes.text();
      console.log(`[${context}] Strategy 2 failed (${filterRes.status}): ${errText.substring(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[${context}] Strategy 2 error:`, e);
  }

  try {
    const appRes = await fetch(`${graphBase}/applications/${idValue}?$select=id,appId,displayName`, { headers });
    if (appRes.ok) {
      const app = await appRes.json();
      console.log(`[${context}] Strategy 3 - Found Application: ${app.displayName} (appId: ${app.appId})`);
      const spRes = await fetch(
        `${graphBase}/servicePrincipals?$filter=appId eq '${app.appId}'&$select=id,displayName`,
        { headers }
      );
      if (spRes.ok) {
        const spData = await spRes.json();
        if (spData.value && spData.value.length > 0) {
          console.log(`[${context}] ✅ Strategy 3 succeeded: ${app.appId} → SP ${spData.value[0].id}`);
          return spData.value[0].id;
        }
      } else {
        await spRes.text();
      }
    } else {
      await appRes.text();
    }
  } catch (e) {
    console.warn(`[${context}] Strategy 3 error:`, e);
  }

  console.error(`[${context}] ❌ All 3 strategies failed for ID: ${idValue}`);
  return null;
}

function humanizeGraphError(code: string | undefined, message: string | undefined, status: number, context: string): string {
  const c = (code || "").toString();
  const m = (message || "").toString();
  if (c === "Authorization_RequestDenied" || /Authorization_RequestDenied|Insufficient privileges/i.test(m)) {
    return `Permissão insuficiente no Microsoft Graph para "${context}". Verifique se o App Registration possui os escopos necessários (ex: GroupMember.ReadWrite.All, User.ReadWrite.All, AppRoleAssignment.ReadWrite.All) com consentimento de administrador no Entra ID.`;
  }
  if (status === 401 || /token|unauthorized/i.test(m)) {
    return `Token Microsoft Graph inválido ou expirado (${status}). Verifique AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID.`;
  }
  if (status === 404) return `Recurso não encontrado no Entra ID (${context}). O objeto pode ter sido removido.`;
  if (status === 429) return `Throttling do Microsoft Graph (429). A operação será reprocessada automaticamente.`;
  return `Erro Graph (${status})${c ? ` [${c}]` : ""}: ${m || "sem detalhes"}`;
}

async function executeAction(
  token: string,
  userId: string,
  actionType: string,
  payload: Record<string, any>
): Promise<{ success: boolean; message: string; alreadyExists?: boolean }> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const graphBase = "https://graph.microsoft.com/v1.0";

  const buildErr = async (res: Response, context: string): Promise<string> => {
    let code: string | undefined; let message: string | undefined;
    try {
      const j = await res.clone().json();
      code = j?.error?.code; message = j?.error?.message;
    } catch {
      try { message = await res.text(); } catch { /* ignore */ }
    }
    return humanizeGraphError(code, message, res.status, context);
  };

  switch (actionType) {
    case "assign_group": {
      const groupId = payload.groupId;
      if (!groupId) return { success: false, message: "groupId ausente no payload" };
      if (payload.onPremisesSync) {
        return { success: false, message: `Grupo "${payload.groupName || groupId}" é sincronizado do AD local` };
      }
      const res = await fetch(`${graphBase}/groups/${groupId}/members/$ref`, {
        method: "POST", headers,
        body: JSON.stringify({ "@odata.id": `${graphBase}/directoryObjects/${userId}` }),
      });
      if (res.status === 204 || res.status === 200) return { success: true, message: `Usuário adicionado ao grupo ${payload.groupName || groupId}` };
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        if (err?.error?.message?.includes("already exist")) return { success: true, message: `Usuário já é membro do grupo`, alreadyExists: true };
        if (err?.error?.message?.includes("on-premises mastered")) return { success: false, message: `Grupo gerenciado pelo AD local` };
        return { success: false, message: humanizeGraphError(err?.error?.code, err?.error?.message, res.status, "adicionar membro ao grupo") };
      }
      return { success: false, message: await buildErr(res, "adicionar membro ao grupo") };
    }

    case "remove_group": {
      const groupId = payload.groupId;
      if (!groupId) return { success: false, message: "groupId ausente no payload" };
      const res = await fetch(`${graphBase}/groups/${groupId}/members/${userId}/$ref`, { method: "DELETE", headers });
      if (res.status === 204 || res.status === 200) return { success: true, message: `Usuário removido do grupo ${payload.groupName || groupId}` };
      if (res.status === 404) return { success: true, message: `Usuário já não é membro do grupo`, alreadyExists: true };
      return { success: false, message: await buildErr(res, "remover membro do grupo") };
    }

    case "assign_license": {
      const skuId = payload.skuId;
      if (!skuId) return { success: false, message: "skuId ausente no payload" };
      try {
        const locRes = await fetch(`${graphBase}/users/${userId}?$select=usageLocation`, { headers });
        if (locRes.ok) {
          const locData = await locRes.json();
          if (!locData.usageLocation) {
            const patchRes = await fetch(`${graphBase}/users/${userId}`, { method: "PATCH", headers, body: JSON.stringify({ usageLocation: "BR" }) });
            if (!patchRes.ok && patchRes.status !== 204) await patchRes.text();
          }
        }
      } catch (e) { console.warn(`[assign_license] Error checking usageLocation:`, e); }
      const res = await fetch(`${graphBase}/users/${userId}/assignLicense`, {
        method: "POST", headers,
        body: JSON.stringify({ addLicenses: [{ skuId, disabledPlans: [] }], removeLicenses: [] }),
      });
      if (res.ok) return { success: true, message: `Licença ${payload.licenseName || skuId} atribuída` };
      const err = await res.json().catch(() => ({}));
      if (err?.error?.message?.includes("already")) return { success: true, message: `Licença já atribuída`, alreadyExists: true };
      return { success: false, message: humanizeGraphError(err?.error?.code, err?.error?.message, res.status, "atribuir licença") };
    }

    case "remove_license": {
      const skuId = payload.skuId;
      if (!skuId) return { success: false, message: "skuId ausente no payload" };
      const res = await fetch(`${graphBase}/users/${userId}/assignLicense`, {
        method: "POST", headers,
        body: JSON.stringify({ addLicenses: [], removeLicenses: [skuId] }),
      });
      if (res.ok) return { success: true, message: `Licença removida` };
      return { success: false, message: await buildErr(res, "remover licença") };
    }

    case "assign_app": {
      const appClientId = payload.appId;
      let appRoleId = payload.appRoleId || "00000000-0000-0000-0000-000000000000";
      if (!appClientId) return { success: false, message: "appId ausente no payload" };
      const spObjectId = await resolveServicePrincipal(headers, graphBase, appClientId, "assign_app");
      if (!spObjectId) return { success: false, message: `Service Principal não encontrado para ${appClientId}` };
      if (appRoleId === "00000000-0000-0000-0000-000000000000") {
        try {
          const spDetailRes = await fetch(`${graphBase}/servicePrincipals/${spObjectId}?$select=appRoles`, { headers });
          if (spDetailRes.ok) {
            const spDetail = await spDetailRes.json();
            const roles = spDetail.appRoles || [];
            const defaultRole = roles.find((r: any) => r.displayName === "Default Access" || r.value === "User" || r.isEnabled);
            if (defaultRole) appRoleId = defaultRole.id;
          } else { await spDetailRes.text(); }
        } catch (e) { console.warn(`[assign_app] Error fetching appRoles:`, e); }
      }
      const res = await fetch(`${graphBase}/servicePrincipals/${spObjectId}/appRoleAssignedTo`, {
        method: "POST", headers,
        body: JSON.stringify({ principalId: userId, resourceId: spObjectId, appRoleId }),
      });
      if (res.ok || res.status === 201) return { success: true, message: `App ${payload.appName || appClientId} atribuído` };
      const err = await res.json().catch(() => ({}));
      if (err?.error?.message?.includes("already exists")) return { success: true, message: `App já atribuído`, alreadyExists: true };
      return { success: false, message: humanizeGraphError(err?.error?.code, err?.error?.message, res.status, "atribuir aplicativo") };
    }

    case "remove_app": {
      const appClientId = payload.appId;
      const assignmentId = payload.assignmentId;
      if (!appClientId) return { success: false, message: "appId ausente no payload" };
      const spObjectId = await resolveServicePrincipal(headers, graphBase, appClientId, "remove_app");
      if (!spObjectId) return { success: false, message: `Service Principal não encontrado` };
      if (assignmentId) {
        const res = await fetch(`${graphBase}/servicePrincipals/${spObjectId}/appRoleAssignedTo/${assignmentId}`, { method: "DELETE", headers });
        if (res.status === 204 || res.ok) return { success: true, message: `App removido` };
        return { success: false, message: await buildErr(res, "remover aplicativo") };
      }
      // List all assignments and filter client-side (Graph API doesn't support $filter on this endpoint in all tenants)
      const listRes = await fetch(`${graphBase}/servicePrincipals/${spObjectId}/appRoleAssignedTo?$top=999`, { headers });
      if (!listRes.ok) {
        const errText = await listRes.text();
        console.error(`[remove_app] Failed to list assignments (${listRes.status}): ${errText.substring(0, 300)}`);
        return { success: false, message: `Erro ao listar assignments: ${listRes.status}` };
      }
      const listData = await listRes.json();
      const userAssignments = (listData.value || []).filter((a: any) => a.principalId === userId);
      if (userAssignments.length > 0) {
        for (const assignment of userAssignments) {
          const delRes = await fetch(`${graphBase}/servicePrincipals/${spObjectId}/appRoleAssignedTo/${assignment.id}`, { method: "DELETE", headers });
          if (delRes.status !== 204 && !delRes.ok) {
            const delErr = await delRes.text();
            console.warn(`[remove_app] Failed to delete assignment ${assignment.id}: ${delErr.substring(0, 200)}`);
          }
        }
        return { success: true, message: `App removido (${userAssignments.length} assignment(s))` };
      }
      return { success: true, message: `Usuário já não tinha acesso`, alreadyExists: true };
    }

    case "disable_entra": {
      const res = await fetch(`${graphBase}/users/${userId}`, { method: "PATCH", headers, body: JSON.stringify({ accountEnabled: false }) });
      if (res.status === 204 || res.ok) return { success: true, message: `Conta desabilitada no Entra ID` };
      return { success: false, message: await buildErr(res, "desabilitar conta no Entra ID") };
    }

    case "enable_entra": {
      const res = await fetch(`${graphBase}/users/${userId}`, { method: "PATCH", headers, body: JSON.stringify({ accountEnabled: true }) });
      if (res.status === 204 || res.ok) return { success: true, message: `Conta reabilitada no Entra ID` };
      return { success: false, message: await buildErr(res, "reabilitar conta no Entra ID") };
    }

    case "update_entra": {
      const updateBody: Record<string, string> = {};
      if (payload.department) updateBody.department = payload.department;
      if (payload.jobTitle) updateBody.jobTitle = payload.jobTitle;
      if (payload.companyName) updateBody.companyName = payload.companyName;
      if (payload.displayName) updateBody.displayName = payload.displayName;
      if (Object.keys(updateBody).length === 0) return { success: true, message: "Nenhum atributo para atualizar" };
      const res = await fetch(`${graphBase}/users/${userId}`, { method: "PATCH", headers, body: JSON.stringify(updateBody) });
      if (res.status === 204 || res.ok) return { success: true, message: `Atributos atualizados: ${Object.keys(updateBody).join(", ")}` };
      return { success: false, message: await buildErr(res, "atualizar atributos do usuário") };
    }

    default:
      return { success: false, message: `action_type não suportado: ${actionType}` };
  }
}

/**
 * Obtain an OAuth 2.0 access token using client_credentials grant.
 */
async function getOAuth2TokenForApp(config: Record<string, any>): Promise<string> {
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
 * Execute an action against an external app using its connector config.
 */
async function executeExternalAppAction(
  supabaseClient: any,
  actionType: string,
  payload: Record<string, any>,
  colaboradorId: string | null
): Promise<{ success: boolean; message: string }> {
  const appId = payload.aplicacao_id;
  if (!appId) return { success: false, message: "aplicacao_id ausente no payload" };

  // Fetch app + connector config (split table)
  const { data: app, error: appErr } = await supabaseClient
    .from("aplicacoes")
    .select("nome, connector_type")
    .eq("id", appId)
    .single();

  if (appErr || !app) return { success: false, message: `Aplicação ${appId} não encontrada` };

  const { data: connRow } = await supabaseClient
    .from("aplicacao_connectors")
    .select("config")
    .eq("aplicacao_id", appId)
    .maybeSingle();

  const config = (connRow?.config || null) as Record<string, any> | null;
  if (!config?.base_url) return { success: false, message: `Conector da aplicação ${app.nome} não configurado (sem base_url)` };

  // Build auth headers
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
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
      if (config.api_key_header && config.api_key_value) authHeaders[config.api_key_header] = config.api_key_value;
      break;
    case "app_token":
      if (config.app_token) authHeaders["App-Token"] = config.app_token;
      if (config.session_token) authHeaders["Session-Token"] = config.session_token;
      break;
    case "oauth2_client_credentials": {
      const token = await getOAuth2TokenForApp(config);
      authHeaders["Authorization"] = `Bearer ${token}`;
      break;
    }
  }
  if (config.custom_headers && typeof config.custom_headers === "object") {
    Object.assign(authHeaders, config.custom_headers);
  }

  const baseUrl = config.base_url.replace(/\/$/, "");

  // Get collaborator info
  let colabInfo: Record<string, any> = {};
  if (colaboradorId) {
    const { data: colab } = await supabaseClient
      .from("colaboradores")
      .select("nome, email, matricula, cpf, sam_account_name")
      .eq("id", colaboradorId)
      .single();
    if (colab) colabInfo = colab;
  }

  // Build request body based on action type and config mappings
  const userPayload: Record<string, any> = {
    ...payload.user_data,
    name: colabInfo.nome || payload.user_data?.name,
    email: colabInfo.email || payload.user_data?.email,
    matricula: colabInfo.matricula,
  };

  // Add internal profile if specified
  if (payload.perfil_interno_id) {
    const { data: pi } = await supabaseClient
      .from("aplicacao_perfis_internos")
      .select("nome_externo, external_id")
      .eq("id", payload.perfil_interno_id)
      .single();
    if (pi) {
      userPayload.profile_id = pi.external_id;
      userPayload.profile_name = pi.nome_externo;
    }
  }

  try {
    switch (actionType) {
      case "create_user_app": {
        const endpoint = config.create_user_endpoint || "/users";
        const fieldMap = config.create_user_fields || {};
        const body = mapFields(userPayload, fieldMap);
        console.log(`[ext-app] POST ${baseUrl}${endpoint} for ${colabInfo.nome || "?"}`);
        const res = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
        if (res.ok || res.status === 201) return { success: true, message: `Usuário criado em ${app.nome}` };
        const errText = await res.text();
        return { success: false, message: `Erro ao criar usuário em ${app.nome} (${res.status}): ${errText.substring(0, 300)}` };
      }

      case "update_user_app": {
        const userId = payload.external_user_id || userPayload.email;
        const endpoint = (config.update_user_endpoint || "/users/{id}").replace("{id}", encodeURIComponent(userId));
        const fieldMap = config.update_user_fields || {};
        const body = mapFields(userPayload, fieldMap);
        console.log(`[ext-app] PUT ${baseUrl}${endpoint}`);
        const res = await fetch(`${baseUrl}${endpoint}`, { method: "PUT", headers: authHeaders, body: JSON.stringify(body) });
        if (res.ok || res.status === 204) return { success: true, message: `Usuário atualizado em ${app.nome}` };
        const errText = await res.text();
        return { success: false, message: `Erro ao atualizar em ${app.nome} (${res.status}): ${errText.substring(0, 300)}` };
      }

      case "disable_user_app": {
        const userId = payload.external_user_id || userPayload.email;
        const endpoint = (config.disable_user_endpoint || "/users/{id}").replace("{id}", encodeURIComponent(userId));
        const body = config.disable_user_body || { is_active: false };
        console.log(`[ext-app] PATCH ${baseUrl}${endpoint} (disable)`);
        const res = await fetch(`${baseUrl}${endpoint}`, { method: "PATCH", headers: authHeaders, body: JSON.stringify(body) });
        if (res.ok || res.status === 204) return { success: true, message: `Usuário desativado em ${app.nome}` };
        const errText = await res.text();
        return { success: false, message: `Erro ao desativar em ${app.nome} (${res.status}): ${errText.substring(0, 300)}` };
      }

      case "delete_user_app": {
        const userId = payload.external_user_id || userPayload.email;
        const endpoint = (config.delete_user_endpoint || "/users/{id}").replace("{id}", encodeURIComponent(userId));
        console.log(`[ext-app] DELETE ${baseUrl}${endpoint}`);
        const res = await fetch(`${baseUrl}${endpoint}`, { method: "DELETE", headers: authHeaders });
        if (res.ok || res.status === 204) return { success: true, message: `Usuário removido de ${app.nome}` };
        const errText = await res.text();
        return { success: false, message: `Erro ao remover de ${app.nome} (${res.status}): ${errText.substring(0, 300)}` };
      }

      default:
        return { success: false, message: `action_type externo não suportado: ${actionType}` };
    }
  } catch (err) {
    return { success: false, message: `Erro de rede com ${app.nome}: ${err instanceof Error ? err.message : "desconhecido"}` };
  }
}

/** Map internal fields to external API fields using a mapping config */
function mapFields(data: Record<string, any>, fieldMap: Record<string, string>): Record<string, any> {
  if (!fieldMap || Object.keys(fieldMap).length === 0) return data;
  const result: Record<string, any> = {};
  for (const [internalKey, externalKey] of Object.entries(fieldMap)) {
    if (data[internalKey] !== undefined) result[externalKey] = data[internalKey];
  }
  // Include unmapped fields as-is
  for (const [key, value] of Object.entries(data)) {
    if (!fieldMap[key] && value !== undefined) result[key] = value;
  }
  return result;
}

function calculateNextRetry(retryCount: number): string {
  const delayMinutes = 5 * Math.pow(2, retryCount);
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._-]+/g, " ")
    .trim();
}

function normalizeIdentifier(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function emailPrefix(value: unknown): string {
  const v = normalizeIdentifier(value);
  return v.includes("@") ? v.split("@")[0] : v;
}

const NAME_STOP_WORDS = new Set(["de", "da", "do", "dos", "das", "e", "del", "di"]);

function nameTokens(value: unknown): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length > 1 && !NAME_STOP_WORDS.has(token));
}

function nameSignature(value: unknown): string {
  const tokens = nameTokens(value);
  if (tokens.length < 2) return "";
  return `${tokens[0]}|${tokens[tokens.length - 1]}`;
}

function addIndexValue(index: Map<string, any[]>, key: string, user: any) {
  if (!key) return;
  const current = index.get(key) || [];
  if (!current.some((u) => u.id === user.id)) current.push(user);
  index.set(key, current);
}

function firstUnique(index: Map<string, any[]>, key: string): any | null {
  if (!key) return null;
  const hits = index.get(key) || [];
  return hits.length === 1 ? hits[0] : null;
}

async function fetchAllGraphUsers(token: string, onProgress?: (count: number) => Promise<void>): Promise<any[]> {
  const users: any[] = [];
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ConsistencyLevel: "eventual",
  };
  const select = [
    "id",
    "displayName",
    "givenName",
    "surname",
    "mail",
    "userPrincipalName",
    "onPremisesSamAccountName",
    "employeeId",
    "otherMails",
    "proxyAddresses",
  ].join(",");
  let url = `https://graph.microsoft.com/v1.0/users?$select=${select}&$top=999`;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Falha ao baixar usuários do Entra (${res.status}): ${text.substring(0, 500)}`);
    }
    const body = await res.json();
    const page = body.value || [];
    users.push(...page);
    if (onProgress) await onProgress(users.length);
    url = body["@odata.nextLink"] || "";
  }

  return users;
}

function buildEntraUserIndex(users: any[]) {
  const byEmail = new Map<string, any[]>();
  const bySam = new Map<string, any[]>();
  const byEmployee = new Map<string, any[]>();
  const byPrefix = new Map<string, any[]>();
  const byName = new Map<string, any[]>();
  const byNameSignature = new Map<string, any[]>();

  for (const user of users) {
    const emails = new Set<string>();
    if (user.mail) emails.add(normalizeIdentifier(user.mail));
    if (user.userPrincipalName) emails.add(normalizeIdentifier(user.userPrincipalName));
    for (const other of user.otherMails || []) emails.add(normalizeIdentifier(other));
    for (const proxy of user.proxyAddresses || []) {
      const cleaned = String(proxy || "").replace(/^smtp:/i, "");
      if (cleaned) emails.add(normalizeIdentifier(cleaned));
    }

    for (const email of emails) {
      addIndexValue(byEmail, email, user);
      const prefix = emailPrefix(email);
      if (prefix && prefix.length >= 4) addIndexValue(byPrefix, prefix, user);
    }

    const sam = normalizeIdentifier(user.onPremisesSamAccountName);
    if (sam) addIndexValue(bySam, sam, user);

    const employee = normalizeIdentifier(user.employeeId);
    if (employee) addIndexValue(byEmployee, employee, user);

    const nameCandidates = [
      user.displayName,
      [user.givenName, user.surname].filter(Boolean).join(" "),
    ].filter(Boolean);
    for (const candidate of nameCandidates) {
      const name = normalizeText(candidate).replace(/\s+/g, " ");
      if (name) addIndexValue(byName, name, user);
      const signature = nameSignature(candidate);
      if (signature) addIndexValue(byNameSignature, signature, user);
    }
  }

  return { byEmail, bySam, byEmployee, byPrefix, byName, byNameSignature };
}

function matchEntraUserForIdentity(identity: {
  nome?: string | null;
  email?: string | null;
  matricula?: string | null;
  sam_account_name?: string | null;
  payload?: Record<string, any> | null;
}, index: ReturnType<typeof buildEntraUserIndex>): { user: any | null; matchedBy: string } {
  const payload = identity.payload || {};
  const emailCandidates = [identity.email, payload.mail, payload.email, payload.userPrincipalName]
    .map(normalizeIdentifier)
    .filter(Boolean);
  for (const email of emailCandidates) {
    const hit = firstUnique(index.byEmail, email);
    if (hit) return { user: hit, matchedBy: `email:${email}` };
  }

  const samCandidates = [identity.sam_account_name, payload.samAccountName, payload.sAMAccountName, payload.sam, payload.userName]
    .map(normalizeIdentifier)
    .filter(Boolean);
  for (const sam of samCandidates) {
    const hit = firstUnique(index.bySam, sam);
    if (hit) return { user: hit, matchedBy: `sam:${sam}` };
  }

  const employeeCandidates = [identity.matricula, payload.employeeId, payload.employID, payload.matricula]
    .map(normalizeIdentifier)
    .filter(Boolean);
  for (const employee of employeeCandidates) {
    const hit = firstUnique(index.byEmployee, employee);
    if (hit) return { user: hit, matchedBy: `employeeId:${employee}` };
  }

  const prefixCandidates = [...emailCandidates.map(emailPrefix), ...samCandidates]
    .filter((v, idx, arr) => v && v.length >= 4 && arr.indexOf(v) === idx);
  for (const prefix of prefixCandidates) {
    const hit = firstUnique(index.byPrefix, prefix);
    if (hit) return { user: hit, matchedBy: `prefix:${prefix}` };
  }

  const name = normalizeText(identity.nome || payload.displayName || payload.nome).replace(/\s+/g, " ");
  if (name) {
    const hit = firstUnique(index.byName, name);
    if (hit) return { user: hit, matchedBy: `nome:${name}` };

    const signature = nameSignature(identity.nome || payload.displayName || payload.nome);
    const signatureHit = firstUnique(index.byNameSignature, signature);
    if (signatureHit) return { user: signatureHit, matchedBy: `nome_assinatura:${signature}` };
  }

  return { user: null, matchedBy: "not_found" };
}

async function fetchAllCsvColaboradores(supabase: any): Promise<any[]> {
  const rows: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("colaboradores")
      .select("id, nome, email, matricula, sam_account_name, entra_id, origem, status")
      .eq("origem", "csv")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchAllCreateQueueItems(supabase: any): Promise<any[]> {
  const rows: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("iam_queue")
      .select("id, target_identity, payload_json, colaborador_id, status")
      .eq("action_type", "create_if_not_exists")
      .in("status", ["waiting_approval", "pending"])
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let forceMode = false;
  let reconcileMode = false;
  try {
    const body = await req.json();
    forceMode = body?.force === true;
    reconcileMode = body?.mode === "reconcile-create";
  } catch { /* no body */ }

  try {
    // Check modo_operacao
    const { data: modoParam } = await supabase
      .from("parametros")
      .select("valor")
      .eq("chave", "modo_operacao")
      .single();

    if (modoParam?.valor === "simulacao" && !reconcileMode) {
      return jsonResponse({ success: true, processed: 0, mode: "simulacao", message: "Modo simulação ativo" });
    }

    // ─── RECONCILE MODE: scan queued create_if_not_exists against Entra ───
    // Runs in background (EdgeRuntime.waitUntil) with progress tracked in sync_jobs.
    if (reconcileMode) {
      if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
        return jsonResponse({ error: "Credenciais Azure não configuradas" }, 500);
      }

      const staleReconcileCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await supabase
        .from("sync_jobs")
        .update({
          status: "error",
          phase: "timeout",
          error: "Reconciliação sem atualização recente; liberada para nova execução.",
          message: "Reconciliação anterior ficou sem atualização recente; inicie novamente para continuar.",
          updated_at: new Date().toISOString(),
        })
        .eq("tipo", "reconcile_entra")
        .eq("status", "running")
        .lt("updated_at", staleReconcileCutoff);

      // Concurrency guard: return existing running job if any
      const { data: existing } = await supabase
        .from("sync_jobs")
        .select("id, status, users_total, users_created, users_updated, users_percent, message, updated_at")
        .eq("tipo", "reconcile_entra")
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ success: true, already_running: true, job: existing }), {
          status: 202, headers: corsHeaders,
        });
      }

      // Count total items to process
      const { count: totalCount } = await supabase
        .from("iam_queue")
        .select("id", { count: "exact", head: true })
        .eq("action_type", "create_if_not_exists")
        .in("status", ["waiting_approval", "pending"]);

      const total = totalCount || 0;
      const { data: job, error: jobErr } = await supabase
        .from("sync_jobs")
        .insert({
          tipo: "reconcile_entra",
          status: "running",
          phase: "iniciando",
          message: `Verificando ${total} item(ns) contra o Entra ID…`,
          users_total: total,
          users_created: 0,
          users_updated: 0,
          users_percent: 0,
        })
        .select("id")
        .single();
      if (jobErr || !job) {
        return jsonResponse({ error: `Falha ao criar job: ${jobErr?.message}` }, 500);
      }
      const jobId = job.id;

      const runReconcile = async () => {
        let linkedColabs = 0;
        let cancelledEntra = 0;
        let cancelledDesligado = 0;
        let kept = 0;
        let scannedColabs = 0;
        try {
          const token = await getAzureToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);

          await supabase.from("sync_jobs").update({
            phase: "baixando_entra",
            message: "Baixando usuários do Entra ID com paginação…",
            users_percent: 5,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);

          const entraUsers = await fetchAllGraphUsers(token, async (count) => {
            await supabase.from("sync_jobs").update({
              phase: "baixando_entra",
              message: `${count.toLocaleString("pt-BR")} usuários baixados do Entra ID…`,
              users_percent: 10,
              updated_at: new Date().toISOString(),
            }).eq("id", jobId);
          });

          await supabase.from("sync_jobs").update({
            phase: "indexando",
            message: `Indexando ${entraUsers.length.toLocaleString("pt-BR")} usuários do Entra ID…`,
            users_percent: 20,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);

          const entraIndex = buildEntraUserIndex(entraUsers);
          const [colaboradores, queueItems] = await Promise.all([
            fetchAllCsvColaboradores(supabase),
            fetchAllCreateQueueItems(supabase),
          ]);

          const colabById = new Map<string, any>();
          const colabByKey = new Map<string, any>();
          const matchedByColabId = new Map<string, { user: any; matchedBy: string }>();
          const matchedKeys = new Map<string, { user: any; matchedBy: string; colabId?: string }>();
          const colabEntraUpdates = new Map<string, string>();

          for (const colab of colaboradores) {
            colabById.set(colab.id, colab);
            const colabKeys = [
              normalizeIdentifier(colab.email),
              normalizeIdentifier(colab.sam_account_name),
              normalizeIdentifier(colab.matricula),
              emailPrefix(colab.email),
              nameSignature(colab.nome),
            ].filter(Boolean);
            for (const k of colabKeys) if (!colabByKey.has(k)) colabByKey.set(k, colab);

            const match = matchEntraUserForIdentity(colab, entraIndex);
            scannedColabs++;
            if (match.user) {
              matchedByColabId.set(colab.id, match);
              for (const key of colabKeys) matchedKeys.set(key, { ...match, colabId: colab.id });

              if (colab.entra_id !== match.user.id) {
                colabEntraUpdates.set(colab.id, match.user.id);
                linkedColabs++;
              }
            }

            if (scannedColabs % 250 === 0) {
              const percent = 20 + Math.floor((scannedColabs / Math.max(colaboradores.length, 1)) * 45);
              await supabase.from("sync_jobs").update({
                phase: "vinculando_colaboradores",
                message: `${scannedColabs}/${colaboradores.length} colaboradores comparados · ${linkedColabs} vinculados`,
                users_created: linkedColabs,
                users_percent: Math.min(65, percent),
                updated_at: new Date().toISOString(),
              }).eq("id", jobId);
            }
          }

          await supabase.from("sync_jobs").update({
            phase: "limpando_aprovacao",
            message: `Limpando ${queueItems.length.toLocaleString("pt-BR")} criação(ões) em aprovação…`,
            users_percent: 70,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);

          const cancelEntraIds: string[] = [];
          const cancelDesligadoIds: string[] = [];
          const queueColabUpdates = new Map<string, string>();
          const queueColabBackfill = new Map<string, string>(); // queue item id → colab id

          const resolveColab = (item: any, payload: Record<string, any>): any | null => {
            if (item.colaborador_id && colabById.has(item.colaborador_id)) {
              return colabById.get(item.colaborador_id);
            }
            const keys = [
              normalizeIdentifier(payload.mail),
              normalizeIdentifier(payload.email),
              normalizeIdentifier(payload.userPrincipalName),
              normalizeIdentifier(payload.samAccountName),
              normalizeIdentifier(payload.sAMAccountName),
              normalizeIdentifier(item.target_identity),
              normalizeIdentifier(payload.employeeId),
              normalizeIdentifier(payload.employID),
              emailPrefix(payload.mail),
              emailPrefix(payload.email),
              emailPrefix(payload.userPrincipalName),
              nameSignature(payload.displayName || payload.nome),
            ].filter(Boolean);
            for (const k of keys) {
              const hit = colabByKey.get(k);
              if (hit) return hit;
            }
            return null;
          };

          for (let i = 0; i < queueItems.length; i++) {
            const item = queueItems[i];
            const payload = (item.payload_json || {}) as Record<string, any>;

            const resolvedColab = resolveColab(item, payload);
            if (resolvedColab && !item.colaborador_id) {
              queueColabBackfill.set(item.id, resolvedColab.id);
            }

            // Rule 1: colaborador desligado → cancel with dedicated reason
            if (resolvedColab && resolvedColab.status === "desligado") {
              cancelDesligadoIds.push(item.id);
              cancelledDesligado++;
            } else {
              // Rule 2: matched in Entra → cancel and persist entra_id
              let match = resolvedColab ? matchedByColabId.get(resolvedColab.id) || null : null;

              if (!match) {
                const direct = matchEntraUserForIdentity({
                  nome: resolvedColab?.nome || payload.displayName || payload.nome,
                  email: resolvedColab?.email || payload.mail || payload.email,
                  matricula: resolvedColab?.matricula || payload.employeeId || payload.employID || payload.matricula,
                  sam_account_name: resolvedColab?.sam_account_name || item.target_identity || payload.samAccountName,
                  payload,
                }, entraIndex);
                if (direct.user) match = direct;
              }

              if (!match) {
                const keys = [
                  normalizeIdentifier(item.target_identity),
                  normalizeIdentifier(payload.mail),
                  normalizeIdentifier(payload.email),
                  normalizeIdentifier(payload.samAccountName),
                  normalizeIdentifier(payload.sAMAccountName),
                  normalizeIdentifier(payload.employeeId),
                  normalizeIdentifier(payload.employID),
                  emailPrefix(payload.mail),
                  emailPrefix(payload.email),
                ].filter(Boolean);
                for (const key of keys) {
                  const hit = matchedKeys.get(key);
                  if (hit) { match = hit; break; }
                }
              }

              if (match?.user?.id) {
                cancelEntraIds.push(item.id);
                const colabIdForUpdate = resolvedColab?.id || item.colaborador_id;
                if (colabIdForUpdate) queueColabUpdates.set(colabIdForUpdate, match.user.id);
                cancelledEntra++;
              } else {
                kept++;
              }
            }

            if ((i + 1) % 100 === 0 || i + 1 === queueItems.length) {
              const percent = 70 + Math.floor(((i + 1) / Math.max(queueItems.length, 1)) * 25);
              await supabase.from("sync_jobs").update({
                phase: "limpando_aprovacao",
                message: `${i + 1}/${queueItems.length} avaliados · ${cancelledEntra} no Entra · ${cancelledDesligado} desligados · ${kept} mantidos`,
                users_created: cancelledEntra + cancelledDesligado,
                users_updated: kept,
                users_percent: Math.min(95, percent),
                updated_at: new Date().toISOString(),
              }).eq("id", jobId);
            }
          }

          // Backfill colaborador_id in queue items (batches of 200 individual updates via upsert-like loop)
          const backfillEntries = Array.from(queueColabBackfill.entries());
          for (let i = 0; i < backfillEntries.length; i += 200) {
            const slice = backfillEntries.slice(i, i + 200);
            await Promise.all(slice.map(([qId, cId]) =>
              supabase.from("iam_queue").update({ colaborador_id: cId }).eq("id", qId)
            ));
          }

          // Cancel: Entra-matched items
          for (let i = 0; i < cancelEntraIds.length; i += 500) {
            const ids = cancelEntraIds.slice(i, i + 500);
            const { error } = await supabase.from("iam_queue").update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
              processed_by: "reconcile-create",
              result_message: "Usuário já existe no Entra ID — item removido pela reconciliação da base da planilha.",
              error_code: null,
            }).in("id", ids);
            if (error) throw error;
          }

          // Cancel: desligado items
          for (let i = 0; i < cancelDesligadoIds.length; i += 500) {
            const ids = cancelDesligadoIds.slice(i, i + 500);
            const { error } = await supabase.from("iam_queue").update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
              processed_by: "reconcile-create",
              result_message: "Colaborador desligado — criação de conta cancelada automaticamente.",
              error_code: null,
            }).in("id", ids);
            if (error) throw error;
          }

          const allColabUpdates = new Map([...colabEntraUpdates, ...queueColabUpdates]);
          let persistedLinks = 0;
          const updateEntries = Array.from(allColabUpdates.entries());
          for (const [colabId, entraId] of updateEntries) {
            const { error } = await supabase.from("colaboradores").update({ entra_id: entraId }).eq("id", colabId);
            if (error) console.warn(`[reconcile] Falha ao gravar entra_id para colaborador ${colabId}: ${error.message}`);
            else persistedLinks++;

            if (persistedLinks % 50 === 0 || persistedLinks === updateEntries.length) {
              await supabase.from("sync_jobs").update({
                phase: "gravando_vinculos",
                message: `${persistedLinks}/${allColabUpdates.size} vínculos gravados · ${cancelledEntra} Entra · ${cancelledDesligado} desligados`,
                users_created: cancelledEntra + cancelledDesligado,
                users_updated: kept,
                users_percent: 97,
                updated_at: new Date().toISOString(),
              }).eq("id", jobId);
            }
          }

          const { count: pendingLeft } = await supabase
            .from("iam_queue")
            .select("id", { count: "exact", head: true })
            .eq("action_type", "create_if_not_exists")
            .in("status", ["waiting_approval", "pending"]);

          const totalCancelled = cancelledEntra + cancelledDesligado;
          await supabase.from("sync_jobs").update({
            status: "success",
            phase: "concluido",
            message: `Reconciliação concluída: ${persistedLinks} vinculados · ${cancelledEntra} cancelados (já existem no Entra) · ${cancelledDesligado} cancelados (desligados) · ${pendingLeft || 0} pendentes.`,
            users_created: totalCancelled,
            users_updated: kept,
            users_percent: 100,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);

          await supabase.from("auditoria").insert({
            entidade: "iam_queue", acao: "reconciliar_create",
            resumo: `Reconciliação: ${persistedLinks} vinculados, ${cancelledEntra} no Entra, ${cancelledDesligado} desligados, ${kept} mantidos.`,
            detalhes: {
              job_id: jobId,
              entra_users: entraUsers.length,
              colaboradores: colaboradores.length,
              scanned_colabs: scannedColabs,
              linked_colabs: persistedLinks,
              queue_items: queueItems.length,
              cancelled_entra: cancelledEntra,
              cancelled_desligado: cancelledDesligado,
              cancelled_total: totalCancelled,
              backfilled_colaborador_id: queueColabBackfill.size,
              kept,
              pending_left: pendingLeft || 0,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[reconcile bg] failed:", msg);
          await supabase.from("sync_jobs").update({
            status: "error",
            phase: "erro",
            error: msg,
            message: `Falha na reconciliação: ${msg}`,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
        }
      };

      // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(runReconcile());
      } else {
        // Fallback: fire and forget
        runReconcile();
      }

      return new Response(JSON.stringify({
        success: true, mode: "reconcile-create", job_id: jobId, total, background: true,
      }), { status: 202, headers: corsHeaders });
    }


    const allResults: { id: string; action: string; status: string; message: string }[] = [];
    let totalProcessed = 0;

    // ─── PART 1: Process Entra ID actions ───
    if (TENANT_ID && CLIENT_ID && CLIENT_SECRET) {
      console.log("Obtaining Azure token...");
      const token = await getAzureToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
      console.log("Azure token acquired");

      while (true) {
        let query = supabase
          .from("iam_queue")
          .select("*")
          .in("action_type", ENTRA_ACTION_TYPES)
          .eq("status", "pending");

        if (!forceMode) {
          query = query.or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString());
        }

        const { data: items, error: fetchErr } = await query
          .order("created_at", { ascending: true })
          .limit(50);

        if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
        if (!items || items.length === 0) break;

        console.log(`Processing batch of ${items.length} Entra ID items (force=${forceMode})...`);

        for (const item of items) {
          const payload = item.payload_json as Record<string, any>;
          await supabase.from("iam_queue").update({ status: "processing" }).eq("id", item.id);

          let email = payload.mail;
          let samAccount = payload.samAccountName;

          if (item.colaborador_id) {
            const { data: colab } = await supabase
              .from("colaboradores")
              .select("nome, email, sam_account_name")
              .eq("id", item.colaborador_id)
              .single();
            if (colab) {
              email = colab.email || email;
              samAccount = colab.sam_account_name || samAccount;
            }
          }

          const { userId, resolvedBy } = await resolveUserId(token, email, samAccount);

          if (!userId) {
            const retryCount = (item.retry_count || 0) + 1;
            const maxRetries = item.max_retries || 10;
            if (retryCount >= maxRetries) {
              await supabase.from("iam_queue").update({
                status: "failed", error_code: "user_not_found",
                result_message: `Usuário não encontrado após ${maxRetries} tentativas. Busca: ${resolvedBy}`,
                processed_at: new Date().toISOString(), processed_by: "lovable_cloud",
              }).eq("id", item.id);
              allResults.push({ id: item.id, action: item.action_type, status: "failed", message: `User not found` });
            } else {
              await supabase.from("iam_queue").update({
                status: "pending", retry_count: retryCount,
                next_retry_at: calculateNextRetry(retryCount),
                error_code: "user_not_found",
                result_message: `Retry ${retryCount}/${maxRetries} — ${resolvedBy}`,
              }).eq("id", item.id);
              allResults.push({ id: item.id, action: item.action_type, status: "retry", message: `Retry ${retryCount}/${maxRetries}` });
            }
            continue;
          }

          const result = await executeAction(token, userId, item.action_type, payload);
          console.log(`[executeAction] item=${item.id} action=${item.action_type} success=${result.success}`);

          if (result.success) {
            await supabase.from("iam_queue").update({
              status: "success", processed_at: new Date().toISOString(), processed_by: "lovable_cloud",
              result_message: `${result.message} [${resolvedBy}]`, error_code: null,
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "success", message: result.message });
          } else {
            const isNonRetryable = result.message.includes("AD local") || result.message.includes("on-premises");
            const retryCount = (item.retry_count || 0) + 1;
            const maxRetries = item.max_retries || 10;

            if (!isNonRetryable && retryCount < maxRetries) {
              await supabase.from("iam_queue").update({
                status: "pending", retry_count: retryCount,
                next_retry_at: calculateNextRetry(retryCount),
                error_code: "graph_api_error",
                result_message: `Retry ${retryCount}/${maxRetries} — ${result.message}`,
              }).eq("id", item.id);
              allResults.push({ id: item.id, action: item.action_type, status: "retry", message: result.message });
            } else {
              await supabase.from("iam_queue").update({
                status: "failed", processed_at: new Date().toISOString(), processed_by: "lovable_cloud",
                result_message: result.message,
                error_code: isNonRetryable ? "on_premises_managed" : "graph_api_error",
              }).eq("id", item.id);
              allResults.push({ id: item.id, action: item.action_type, status: "failed", message: result.message });
              await supabase.from("alertas").insert({
                titulo: `Falha: ${item.action_type}`, mensagem: `Ação ${item.action_type} falhou para ${item.target_identity || "?"}: ${result.message}`,
                severidade: "critico", tipo: "provisionamento_falha",
                ref_url: "/fila-provisionamento", ref_id: item.id, ref_tipo: "iam_queue",
              });
            }
          }
        }

        totalProcessed += items.length;
        if (items.length < 50) break;
      }
    }

    // ─── PART 2: Process External App actions ───
    while (true) {
      let query = supabase
        .from("iam_queue")
        .select("*")
        .in("action_type", EXTERNAL_APP_ACTION_TYPES)
        .eq("status", "pending");

      if (!forceMode) {
        query = query.or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString());
      }

      const { data: items, error: fetchErr } = await query
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
      if (!items || items.length === 0) break;

      console.log(`Processing batch of ${items.length} external app items...`);

      for (const item of items) {
        const payload = item.payload_json as Record<string, any>;
        await supabase.from("iam_queue").update({ status: "processing" }).eq("id", item.id);

        const result = await executeExternalAppAction(supabase, item.action_type, payload, item.colaborador_id);
        console.log(`[ext-app] item=${item.id} action=${item.action_type} success=${result.success}`);

        if (result.success) {
          await supabase.from("iam_queue").update({
            status: "success", processed_at: new Date().toISOString(), processed_by: "lovable_cloud",
            result_message: result.message, error_code: null,
          }).eq("id", item.id);
          allResults.push({ id: item.id, action: item.action_type, status: "success", message: result.message });
        } else {
          const retryCount = (item.retry_count || 0) + 1;
          const maxRetries = item.max_retries || 10;
          if (retryCount < maxRetries) {
            await supabase.from("iam_queue").update({
              status: "pending", retry_count: retryCount,
              next_retry_at: calculateNextRetry(retryCount),
              error_code: "ext_app_error",
              result_message: `Retry ${retryCount}/${maxRetries} — ${result.message}`,
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "retry", message: result.message });
          } else {
            await supabase.from("iam_queue").update({
              status: "failed", processed_at: new Date().toISOString(), processed_by: "lovable_cloud",
              result_message: result.message, error_code: "ext_app_error",
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "failed", message: result.message });
            await supabase.from("alertas").insert({
              titulo: `Falha ext: ${item.action_type}`, mensagem: result.message,
              severidade: "critico", tipo: "provisionamento_falha",
              ref_url: "/fila-provisionamento", ref_id: item.id, ref_tipo: "iam_queue",
            });
          }
        }
      }

      totalProcessed += items.length;
      if (items.length < 50) break;
    }

    if (totalProcessed === 0) {
      return jsonResponse({ success: true, processed: 0, message: "Nenhum item pendente na fila" });
    }

    const summary = {
      success: allResults.filter(r => r.status === "success").length,
      retries: allResults.filter(r => r.status === "retry").length,
      failures: allResults.filter(r => r.status === "failed").length,
    };

    console.log(`Done: ${summary.success} success, ${summary.retries} retries, ${summary.failures} failures`);

    return jsonResponse({ success: true, processed: totalProcessed, summary, results: allResults });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("process-iam-queue error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
