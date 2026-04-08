import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-key",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Bootstrap reset via service role key header (for initial setup)
    if (body.action === "reset_password" && req.headers.get("x-bootstrap-key") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      if (!body.user_id || !body.password || body.password.length < 6) {
        return new Response(JSON.stringify({ error: "user_id e senha (mín 6 chars) obrigatórios" }), { status: 400, headers: corsHeaders });
      }
      const { error } = await adminClient.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true, message: "Senha atualizada." }), { headers: corsHeaders });
    }

    // Standard auth check
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

    const { data: roleCheck } = await anonClient.rpc("has_role", {
      _user_id: claims.user.id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores" }), { status: 403, headers: corsHeaders });
    }

    // --- RESET PASSWORD (authenticated admin) ---
    if (body.action === "reset_password") {
      if (!body.user_id || !body.password || body.password.length < 6) {
        return new Response(JSON.stringify({ error: "user_id e senha (mín 6 chars) obrigatórios" }), { status: 400, headers: corsHeaders });
      }
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (resetErr) return new Response(JSON.stringify({ error: resetErr.message }), { status: 400, headers: corsHeaders });
      return new Response(JSON.stringify({ success: true, message: "Senha atualizada com sucesso." }), { headers: corsHeaders });
    }

    // --- CREATE USER ---
    const { email, nome, role, password } = body;
    if (!email || !nome) {
      return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), { status: 400, headers: corsHeaders });
    }
    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Senha é obrigatória (mínimo 6 caracteres)" }), { status: 400, headers: corsHeaders });
    }
    if (!["admin", "operador", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Role inválido" }), { status: 400, headers: corsHeaders });
    }

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });
    }

    if (newUser?.user) {
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: newUser?.user?.id,
      message: `Usuário ${email} criado com sucesso.` 
    }), { headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
