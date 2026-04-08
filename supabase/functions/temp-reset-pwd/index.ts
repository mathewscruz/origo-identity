import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { user_id, password } = await req.json();
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
});
