import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsErr } = await anonClient.auth.getUser();
    if (claimsErr || !claims?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: corsHeaders });
    }

    // Check admin role
    const { data: roleCheck } = await anonClient.rpc("has_role", {
      _user_id: claims.user.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), { status: 403, headers: corsHeaders });
    }

    // Parse body
    const { email, nome, role } = await req.json();
    if (!email || !nome) {
      return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), { status: 400, headers: corsHeaders });
    }
    if (!["admin", "operador", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Role inválido" }), { status: 400, headers: corsHeaders });
    }

    // Use service_role to invite user (sends email with link to set password)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: newUser, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nome },
    });

    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400, headers: corsHeaders });
    }

    // Insert role
    if (newUser?.user) {
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: newUser?.user?.id,
      message: `Convite enviado para ${email}. O usuário receberá um e-mail para definir sua senha.` 
    }), { headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
