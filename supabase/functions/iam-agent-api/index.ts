import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const RETRYABLE_ERRORS = ["user_not_found", "user_not_synced", "not_found_in_entra", "replication_pending", "AD_AGENT_ERROR"];

// AD local action types — sempre expostos ao Órigo Agente (comportamento legado)
const AD_LOCAL_ACTION_TYPES = ["create", "create_if_not_exists", "update", "disable", "delete"];

// Modo agent_orchestrated: agente também executa Entra ID + apps externos
const AGENT_ORCHESTRATED_ACTION_TYPES = [
  ...AD_LOCAL_ACTION_TYPES,
  "assign_group", "remove_group",
  "assign_license", "remove_license",
  "assign_app", "remove_app",
  "disable_entra", "enable_entra",
  "update_entra",
  "create_user_app", "update_user_app",
  "disable_user_app", "delete_user_app",
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

/**
 * Aceita duas formas de autenticação:
 *  1. Bearer IAM_AGENT_TOKEN (agente/serviço) — comportamento legado preservado.
 *  2. JWT Supabase de usuário autenticado com papel admin ou operador
 *     (mesma lógica de requireRole usada nas demais Edge Functions protegidas).
 */
async function authorize(
  req: Request
): Promise<{ ok: true; method: "agent_token" | "user_jwt"; userId?: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  }
  const bearer = authHeader.slice(7).trim();

  // 1) Match direto contra IAM_AGENT_TOKEN (constant-time-ish comparison)
  const expected = Deno.env.get("IAM_AGENT_TOKEN") || "";
  if (expected && bearer.length === expected.length) {
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) return { ok: true, method: "agent_token" };
  }

  // 2) Fallback: JWT de usuário admin/operador
  const roleCheck = await requireRole(req, ["admin", "operador"]);
  if (roleCheck instanceof Response) {
    return { ok: false, response: roleCheck };
  }
  return { ok: true, method: "user_jwt", userId: roleCheck.userId };
}

function calculateNextRetry(retryCount: number): string {
  // Exponential backoff: 5min, 10min, 20min, 40min, 80min, 160min...
  const delayMinutes = 5 * Math.pow(2, retryCount);
  const next = new Date(Date.now() + delayMinutes * 60 * 1000);
  return next.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await authorize(req);
  if (!authResult.ok) return authResult.response;


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  // GET /pending
  if (req.method === "GET" && path === "pending") {
    // Check modo_operacao
    const { data: modoParam } = await supabase
      .from("parametros")
      .select("valor")
      .eq("chave", "modo_operacao")
      .single();

    if (modoParam?.valor === "simulacao") {
      return jsonResponse({ success: true, count: 0, data: [], mode: "simulacao" });
    }

    // Read execution mode (agent_orchestrated → expõe também Entra/apps ao agente)
    const { data: execModeParam } = await supabase
      .from("parametros")
      .select("valor")
      .eq("chave", "iam_execution_mode")
      .maybeSingle();
    const executionMode = execModeParam?.valor === "agent_orchestrated" ? "agent_orchestrated" : "legacy";
    const actionTypes = executionMode === "agent_orchestrated"
      ? AGENT_ORCHESTRATED_ACTION_TYPES
      : AD_LOCAL_ACTION_TYPES;

    const { data, error } = await supabase
      .from("iam_queue")
      .select("*")
      .eq("status", "pending")
      .in("action_type", actionTypes)
      .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({
      success: true,
      count: data.length,
      data,
      execution_mode: executionMode,
      action_types: actionTypes,
    });
  }

  // POST /update
  if (req.method === "POST" && path === "update") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { id, status, processed_at, result_message, processed_by, target_identity, error_code } = body as {
      id?: string;
      status?: string;
      processed_at?: string;
      result_message?: string;
      processed_by?: string;
      target_identity?: string;
      error_code?: string;
    };

    if (!id || !status) {
      return jsonResponse({ error: "id and status are required" }, 400);
    }

    // Check if this is a retryable failure
    if (status === "failed" && error_code && RETRYABLE_ERRORS.includes(error_code)) {
      // Fetch current item to check retry_count and max_retries
      const { data: currentItem } = await supabase
        .from("iam_queue")
        .select("retry_count, max_retries")
        .eq("id", id)
        .single();

      // For user_not_found (identidade ausente — não é falha transitória), cap at 3 retries.
      // Other retryable errors keep the item's normal max_retries (default 10).
      const effectiveMax = error_code === "user_not_found"
        ? Math.min(3, currentItem?.max_retries ?? 3)
        : (currentItem?.max_retries ?? 10);

      if (currentItem && currentItem.retry_count < effectiveMax) {
        const newRetryCount = currentItem.retry_count + 1;
        const nextRetryAt = calculateNextRetry(newRetryCount);

        const { data, error: updateError } = await supabase
          .from("iam_queue")
          .update({
            status: "pending",
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt,
            result_message: result_message || `Retry ${newRetryCount}/${effectiveMax} — ${error_code}`,
            error_code,
            processed_by: processed_by || undefined,
          })
          .eq("id", id)
          .select()
          .single();

        if (updateError) return jsonResponse({ error: updateError.message }, 500);
        return jsonResponse({
          success: true,
          retried: true,
          retry_count: newRetryCount,
          max_retries: currentItem.max_retries,
          next_retry_at: nextRetryAt,
          data,
        });
      }
      // max retries exceeded — fall through to normal failed update
    }

    const updatePayload: Record<string, unknown> = { status };
    if (processed_at) updatePayload.processed_at = processed_at;
    if (result_message !== undefined) updatePayload.result_message = result_message;
    if (processed_by) updatePayload.processed_by = processed_by;
    if (error_code !== undefined) updatePayload.error_code = error_code;
    if (target_identity) updatePayload.target_identity = target_identity;

    const { data, error: updateError } = await supabase
      .from("iam_queue")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) return jsonResponse({ error: updateError.message }, 500);
    return jsonResponse({ success: true, data });
  }

  return jsonResponse({ error: "Not found. Use GET /pending or POST /update" }, 404);
});
