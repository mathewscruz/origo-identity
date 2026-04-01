import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

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
    const { data, error } = await supabase
      .from("iam_queue")
      .select("*")
      .eq("status", "pending")
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

    const { id, status, processed_at, result_message, processed_by, error_code } = body as {
      id?: string;
      status?: string;
      processed_at?: string;
      result_message?: string;
      processed_by?: string;
      error_code?: string;
    };

    if (!id || !status) {
      return jsonResponse({ error: "id and status are required" }, 400);
    }

    const updatePayload: Record<string, unknown> = { status };
    if (processed_at) updatePayload.processed_at = processed_at;
    if (result_message !== undefined) updatePayload.result_message = result_message;
    if (processed_by) updatePayload.processed_by = processed_by;
    if (error_code !== undefined) updatePayload.error_code = error_code;

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
