import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ENTRA_ACTION_TYPES = [
  "assign_group", "remove_group",
  "assign_license", "remove_license",
  "assign_app", "remove_app",
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

/**
 * Resolve user in Entra ID using email as primary identifier.
 * Priority: mail → userPrincipalName → onPremisesSamAccountName (fallback)
 */
async function resolveUserId(
  token: string,
  email: string | null,
  samAccountName: string | null
): Promise<{ userId: string | null; resolvedBy: string }> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1. Try by mail (primary)
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

  // 2. Fallback: try by onPremisesSamAccountName
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

async function executeAction(
  token: string,
  userId: string,
  actionType: string,
  payload: Record<string, any>
): Promise<{ success: boolean; message: string; alreadyExists?: boolean }> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const graphBase = "https://graph.microsoft.com/v1.0";

  switch (actionType) {
    case "assign_group": {
      const groupId = payload.groupId;
      if (!groupId) return { success: false, message: "groupId ausente no payload" };

      if (payload.onPremisesSync) {
        return { success: false, message: `Grupo "${payload.groupName || groupId}" é sincronizado do AD local — adicione o membro no AD local e aguarde a replicação` };
      }

      const res = await fetch(`${graphBase}/groups/${groupId}/members/$ref`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          "@odata.id": `${graphBase}/directoryObjects/${userId}`,
        }),
      });

      if (res.status === 204 || res.status === 200) {
        return { success: true, message: `Usuário adicionado ao grupo ${payload.groupName || groupId}` };
      }
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        if (err?.error?.message?.includes("already exist")) {
          return { success: true, message: `Usuário já é membro do grupo ${payload.groupName || groupId}`, alreadyExists: true };
        }
        if (err?.error?.message?.includes("on-premises mastered")) {
          return { success: false, message: `Grupo "${payload.groupName || groupId}" é gerenciado pelo AD local — não pode ser alterado via Entra ID` };
        }
        return { success: false, message: `Erro ao adicionar ao grupo: ${err?.error?.message || res.status}` };
      }
      const errText = await res.text();
      return { success: false, message: `Graph API erro ${res.status}: ${errText}` };
    }

    case "remove_group": {
      const groupId = payload.groupId;
      if (!groupId) return { success: false, message: "groupId ausente no payload" };

      const res = await fetch(`${graphBase}/groups/${groupId}/members/${userId}/$ref`, {
        method: "DELETE",
        headers,
      });

      if (res.status === 204 || res.status === 200) {
        return { success: true, message: `Usuário removido do grupo ${payload.groupName || groupId}` };
      }
      if (res.status === 404) {
        return { success: true, message: `Usuário já não é membro do grupo ${payload.groupName || groupId}`, alreadyExists: true };
      }
      const errText = await res.text();
      return { success: false, message: `Graph API erro ${res.status}: ${errText}` };
    }

    case "assign_license": {
      const skuId = payload.skuId;
      if (!skuId) return { success: false, message: "skuId ausente no payload" };

      const res = await fetch(`${graphBase}/users/${userId}/assignLicense`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          addLicenses: [{ skuId, disabledPlans: [] }],
          removeLicenses: [],
        }),
      });

      if (res.ok) {
        return { success: true, message: `Licença ${payload.licenseName || skuId} atribuída com sucesso` };
      }
      const err = await res.json().catch(() => ({}));
      if (err?.error?.message?.includes("already")) {
        return { success: true, message: `Licença ${payload.licenseName || skuId} já atribuída`, alreadyExists: true };
      }
      return { success: false, message: `Erro ao atribuir licença: ${err?.error?.message || res.status}` };
    }

    case "remove_license": {
      const skuId = payload.skuId;
      if (!skuId) return { success: false, message: "skuId ausente no payload" };

      const res = await fetch(`${graphBase}/users/${userId}/assignLicense`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          addLicenses: [],
          removeLicenses: [skuId],
        }),
      });

      if (res.ok) {
        return { success: true, message: `Licença ${payload.licenseName || skuId} removida com sucesso` };
      }
      const errText = await res.text();
      return { success: false, message: `Erro ao remover licença: ${errText}` };
    }

    case "assign_app": {
      const appId = payload.appId;
      const appRoleId = payload.appRoleId || "00000000-0000-0000-0000-000000000000";
      if (!appId) return { success: false, message: "appId ausente no payload" };

      const res = await fetch(`${graphBase}/servicePrincipals/${appId}/appRoleAssignedTo`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          principalId: userId,
          resourceId: appId,
          appRoleId: appRoleId,
        }),
      });

      if (res.ok || res.status === 201) {
        return { success: true, message: `App ${payload.appName || appId} atribuído com sucesso` };
      }
      const err = await res.json().catch(() => ({}));
      if (err?.error?.message?.includes("already exists")) {
        return { success: true, message: `App ${payload.appName || appId} já atribuído`, alreadyExists: true };
      }
      return { success: false, message: `Erro ao atribuir app: ${err?.error?.message || res.status}` };
    }

    case "remove_app": {
      const appId = payload.appId;
      const assignmentId = payload.assignmentId;
      if (!appId) return { success: false, message: "appId ausente no payload" };

      if (assignmentId) {
        const res = await fetch(`${graphBase}/servicePrincipals/${appId}/appRoleAssignedTo/${assignmentId}`, {
          method: "DELETE",
          headers,
        });
        if (res.status === 204 || res.ok) {
          return { success: true, message: `App ${payload.appName || appId} removido com sucesso` };
        }
        const errText = await res.text();
        return { success: false, message: `Erro ao remover app: ${errText}` };
      }

      const listRes = await fetch(
        `${graphBase}/servicePrincipals/${appId}/appRoleAssignedTo?$filter=principalId eq '${userId}'`,
        { headers }
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.value && listData.value.length > 0) {
          for (const assignment of listData.value) {
            await fetch(`${graphBase}/servicePrincipals/${appId}/appRoleAssignedTo/${assignment.id}`, {
              method: "DELETE",
              headers,
            });
          }
          return { success: true, message: `App ${payload.appName || appId} removido com sucesso` };
        }
        return { success: true, message: `Usuário não tinha acesso ao app ${payload.appName || appId}`, alreadyExists: true };
      }
      return { success: false, message: `Erro ao listar assignments do app` };
    }

    default:
      return { success: false, message: `action_type não suportado: ${actionType}` };
  }
}

function calculateNextRetry(retryCount: number): string {
  const delayMinutes = 5 * Math.pow(2, retryCount);
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return jsonResponse({ error: "Azure credentials not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Check for force mode from request body
  let forceMode = false;
  try {
    const body = await req.json();
    forceMode = body?.force === true;
  } catch { /* no body or invalid JSON — default to non-force */ }

  try {
    // Check modo_operacao
    const { data: modoParam } = await supabase
      .from("parametros")
      .select("valor")
      .eq("chave", "modo_operacao")
      .single();

    if (modoParam?.valor === "simulacao") {
      return jsonResponse({ success: true, processed: 0, mode: "simulacao", message: "Modo simulação ativo — nenhuma ação executada" });
    }

    // Get Azure token
    console.log("Obtaining Azure token...");
    const token = await getAzureToken(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
    console.log("Azure token acquired");

    // Process ALL pending Entra ID items in a loop
    const allResults: { id: string; action: string; status: string; message: string }[] = [];
    let totalProcessed = 0;

    while (true) {
      let query = supabase
        .from("iam_queue")
        .select("*")
        .in("action_type", ENTRA_ACTION_TYPES)
        .eq("status", "pending");

      // In force mode, ignore next_retry_at — process everything pending
      if (!forceMode) {
        query = query.or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString());
      }

      const { data: items, error: fetchErr } = await query
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchErr) {
        return jsonResponse({ error: fetchErr.message }, 500);
      }

      if (!items || items.length === 0) break;

      console.log(`Processing batch of ${items.length} Entra ID queue items (force=${forceMode})...`);

      for (const item of items) {
        const payload = item.payload_json as Record<string, any>;

        // Mark as processing
        await supabase.from("iam_queue").update({ status: "processing" }).eq("id", item.id);

        // Resolve email/name from the database (source of truth), not from payload
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
            console.log(`[process] Colaborador ${item.colaborador_id}: email=${email}, sam=${samAccount}, nome=${colab.nome}`);
          }
        }

        // Resolve user in Entra ID using email as primary
        const { userId, resolvedBy } = await resolveUserId(token, email, samAccount);

        if (!userId) {
          const retryCount = (item.retry_count || 0) + 1;
          const maxRetries = item.max_retries || 10;

          if (retryCount >= maxRetries) {
            await supabase.from("iam_queue").update({
              status: "failed",
              error_code: "user_not_found",
              result_message: `Usuário não encontrado no Entra ID após ${maxRetries} tentativas. Busca por: ${resolvedBy}`,
              processed_at: new Date().toISOString(),
              processed_by: "lovable_cloud",
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "failed", message: `User not found - ${resolvedBy}` });
          } else {
            const nextRetry = calculateNextRetry(retryCount);
            await supabase.from("iam_queue").update({
              status: "pending",
              retry_count: retryCount,
              next_retry_at: nextRetry,
              error_code: "user_not_found",
              result_message: `Retry ${retryCount}/${maxRetries} — Busca por: ${resolvedBy}`,
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "retry", message: `Retry ${retryCount}/${maxRetries}` });
          }
          continue;
        }

        // Execute the action
        const result = await executeAction(token, userId, item.action_type, payload);

        if (result.success) {
          await supabase.from("iam_queue").update({
            status: "success",
            processed_at: new Date().toISOString(),
            processed_by: "lovable_cloud",
            result_message: `${result.message} [resolvido por: ${resolvedBy}]`,
            error_code: null,
          }).eq("id", item.id);
          allResults.push({ id: item.id, action: item.action_type, status: "success", message: result.message });
        } else {
          const isNonRetryable = result.message.includes("AD local") || result.message.includes("on-premises");
          const retryCount = (item.retry_count || 0) + 1;
          const maxRetries = item.max_retries || 10;

          if (!isNonRetryable && retryCount < maxRetries) {
            const nextRetry = calculateNextRetry(retryCount);
            await supabase.from("iam_queue").update({
              status: "pending",
              retry_count: retryCount,
              next_retry_at: nextRetry,
              error_code: "graph_api_error",
              result_message: `Retry ${retryCount}/${maxRetries} — ${result.message}`,
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "retry", message: result.message });
          } else {
            await supabase.from("iam_queue").update({
              status: "failed",
              processed_at: new Date().toISOString(),
              processed_by: "lovable_cloud",
              result_message: result.message,
              error_code: isNonRetryable ? "on_premises_managed" : "graph_api_error",
            }).eq("id", item.id);
            allResults.push({ id: item.id, action: item.action_type, status: "failed", message: result.message });
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

    return jsonResponse({
      success: true,
      processed: totalProcessed,
      summary,
      results: allResults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("process-iam-queue error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
