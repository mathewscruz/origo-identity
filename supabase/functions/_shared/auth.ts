import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

export type AppRole = "admin" | "operador" | "viewer";

/**
 * Verifies the request bears a valid Supabase JWT and the user has at least
 * one of the required roles. Returns null on success, or a 401/403 Response
 * to forward to the client.
 */
export async function requireRole(
  req: Request,
  allowedRoles: AppRole[] = ["admin", "operador"]
): Promise<{ userId: string; client: ReturnType<typeof createClient> } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: corsHeaders });
  }

  for (const role of allowedRoles) {
    const { data: ok } = await anonClient.rpc("has_role", { _user_id: userData.user.id, _role: role });
    if (ok) return { userId: userData.user.id, client: anonClient };
  }

  return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: corsHeaders });
}
