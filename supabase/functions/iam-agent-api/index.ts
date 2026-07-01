import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

const RETRYABLE_ERRORS = ["user_not_found", "user_not_synced", "not_found_in_entra", "replication_pending", "AD_AGENT_ERROR"];

// Only AD local action types — Entra ID actions are processed by process-iam-queue
const AD_LOCAL_ACTION_TYPES = ["create", "create_if_not_exists", "update", "disable", "delete"];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function authorize(req: Request): boolean {
  const expected = Deno.env.get("IAM_AGENT_TOKEN");
  if (!expected) return false;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
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

  if (!authorize(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

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

    const { data, error } = await supabase
      .from("iam_queue")
      .select("*")
      .eq("status", "pending")
      .in("action_type", AD_LOCAL_ACTION_TYPES)
      .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true, count: data.length, data });
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
            result_message: result_message || `Retry ${newRetryCount}/${currentItem.max_retries} — ${error_code}`,
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
