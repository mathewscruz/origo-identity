import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

export type AppRole = "admin" | "operador" | "viewer" | "platform_admin";

export interface AuthContext {
  /** null quando a chamada veio com a service role key (cron/jobs internos) */
  userId: string | null;
  /** e-mail do usuário autenticado, ou "sistema" para service role */
  email: string;
  isService: boolean;
  client: ReturnType<typeof createClient>;
}

/**
 * Verifies the request bears a valid Supabase JWT and the user has at least
 * one of the required roles. Returns the auth context on success, or a 401/403
 * Response to forward to the client.
 */
export async function requireRole(
  req: Request,
  allowedRoles: AppRole[] = ["admin", "operador"]
): Promise<AuthContext | Response> {
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
    if (ok) {
      return {
        userId: userData.user.id,
        email: userData.user.email ?? userData.user.id,
        isService: false,
        client: anonClient,
      };
    }
  }

  return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: corsHeaders });
}

/**
 * Same as requireRole, but also accepts calls made with the service-role key
 * (internal/cron invocations). Returns the auth context or a Response to forward.
 */
export async function requireRoleOrService(
  req: Request,
  allowedRoles: AppRole[] = ["admin", "operador"]
): Promise<AuthContext | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && authHeader === `Bearer ${serviceKey}`) {
    return {
      userId: null,
      email: "sistema",
      isService: true,
      client: createClient(Deno.env.get("SUPABASE_URL")!, serviceKey),
    };
  }
  return await requireRole(req, allowedRoles);
}

/** Cliente com service role (bypass RLS) — usar só depois de autorizar a chamada. */
export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Header Authorization com a service role key, para chamadas internas entre functions. */
export function serviceAuthHeader(): string {
  return `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
}
