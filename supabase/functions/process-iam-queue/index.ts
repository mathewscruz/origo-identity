import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
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

async function resolveUserId(
  token: string,
  payload: Record<string, any>
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Try by mail first, then by userPrincipalName pattern
  const mail = payload.mail;
  const sam = payload.samAccountName;

  if (mail) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encodeURIComponent(mail)}'&$select=id,displayName,mail`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.value && data.value.length > 0) return data.value[0].id;
    }
  }

  // Try by userPrincipalName
  if (sam) {
    // Try common UPN patterns
    const upnPatterns = [
      `${sam}@ebessolar.local`,
      `${sam}@ebessolar.com.br`,
      `${sam}@ebes.com.br`,
    ];
    for (const upn of upnPatterns) {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.id) return data.id;
        }
      } catch { /* try next */ }
    }

    // Try by displayName or onPremisesSamAccountName filter
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=onPremisesSamAccountName eq '${encodeURIComponent(sam)}'&$select=id,displayName`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.value && data.value.length > 0) return data.value[0].id;
    }
  }

  return null;
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
      // 400 = already a member
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        if (err?.error?.message?.includes("already exist")) {
          return { success: true, message: `Usuário já é membro do grupo ${payload.groupName || groupId}`, alreadyExists: true };
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
      // Already assigned
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
      const appId = payload.appId; // Service Principal ID
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

      // If no assignmentId, find and remove
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

    // Fetch pending Entra ID items
    const { data: items, error: fetchErr } = await supabase
      .from("iam_queue")
      .select("*")
      .in("action_type", ENTRA_ACTION_TYPES)
      .eq("status", "pending")
      .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);

    if (fetchErr) {
      return jsonResponse({ error: fetchErr.message }, 500);
    }

    if (!items || items.length === 0) {
      return jsonResponse({ success: true, processed: 0, message: "Nenhum item pendente na fila" });
    }

    console.log(`Processing ${items.length} Entra ID queue items...`);

    const results: { id: string; action: string; status: string; message: string }[] = [];

    for (const item of items) {
      const payload = item.payload_json as Record<string, any>;

      // Mark as processing
      await supabase.from("iam_queue").update({ status: "processing" }).eq("id", item.id);

      // Resolve user in Entra ID
      const userId = await resolveUserId(token, payload);

      if (!userId) {
        // User not found — retry
        const retryCount = (item.retry_count || 0) + 1;
        const maxRetries = item.max_retries || 10;

        if (retryCount >= maxRetries) {
          await supabase.from("iam_queue").update({
            status: "failed",
            error_code: "user_not_found",
            result_message: `Usuário não encontrado no Entra ID após ${maxRetries} tentativas (sam: ${payload.samAccountName}, mail: ${payload.mail})`,
            processed_at: new Date().toISOString(),
            processed_by: "lovable_cloud",
          }).eq("id", item.id);

          results.push({ id: item.id, action: item.action_type, status: "failed", message: "User not found - max retries exceeded" });
        } else {
          const nextRetry = calculateNextRetry(retryCount);
          await supabase.from("iam_queue").update({
            status: "pending",
            retry_count: retryCount,
            next_retry_at: nextRetry,
            error_code: "user_not_found",
            result_message: `Retry ${retryCount}/${maxRetries} — usuário não encontrado no Entra ID`,
          }).eq("id", item.id);

          results.push({ id: item.id, action: item.action_type, status: "retry", message: `Retry ${retryCount}/${maxRetries}` });
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
          result_message: result.message,
          error_code: null,
        }).eq("id", item.id);

        results.push({ id: item.id, action: item.action_type, status: "success", message: result.message });
      } else {
        // Check if retryable
        const retryCount = (item.retry_count || 0) + 1;
        const maxRetries = item.max_retries || 10;

        if (retryCount < maxRetries) {
          const nextRetry = calculateNextRetry(retryCount);
          await supabase.from("iam_queue").update({
            status: "pending",
            retry_count: retryCount,
            next_retry_at: nextRetry,
            error_code: "graph_api_error",
            result_message: `Retry ${retryCount}/${maxRetries} — ${result.message}`,
          }).eq("id", item.id);
          results.push({ id: item.id, action: item.action_type, status: "retry", message: result.message });
        } else {
          await supabase.from("iam_queue").update({
            status: "failed",
            processed_at: new Date().toISOString(),
            processed_by: "lovable_cloud",
            result_message: result.message,
            error_code: "graph_api_error",
          }).eq("id", item.id);
          results.push({ id: item.id, action: item.action_type, status: "failed", message: result.message });
        }
      }
    }

    const summary = {
      success: results.filter(r => r.status === "success").length,
      retries: results.filter(r => r.status === "retry").length,
      failures: results.filter(r => r.status === "failed").length,
    };

    console.log(`Done: ${summary.success} success, ${summary.retries} retries, ${summary.failures} failures`);

    return jsonResponse({
      success: true,
      processed: items.length,
      summary,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("process-iam-queue error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
