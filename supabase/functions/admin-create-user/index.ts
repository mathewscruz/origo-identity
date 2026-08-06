import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BASE_URL = Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app";
const LOGO_URL = "https://iam.origoenergia.com.br/email/logo-origo.png";
const BRAND_COLOR = "#16968D";
const BRAND_DARK = "#0d8276";

function baseLayout(title: string, body: string, actionUrl?: string, actionLabel?: string): string {
  const actionBlock = actionUrl && actionLabel ? `
    <tr><td style="padding:28px 40px 0;text-align:center;">
      <a href="${actionUrl}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_COLOR};background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(22,150,141,0.3);">${actionLabel}</a>
    </td></tr>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06)">
  <tr><td style="background:linear-gradient(135deg,#1a1f2c 0%,#2d3748 100%);padding:28px 40px;text-align:center;">
    <img src="${LOGO_URL}" alt="Órigo" width="160" style="display:block;margin:0 auto 12px;" />
    <div style="width:40px;height:2px;background:${BRAND_COLOR};margin:0 auto 12px;border-radius:2px;"></div>
    <p style="margin:0;color:#94a3b8;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;">${title}</p>
  </td></tr>
  <tr><td style="padding:36px 40px 28px;color:#1e293b;font-size:14px;line-height:1.8;">${body}</td></tr>
  ${actionBlock}
  <tr><td style="padding:32px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;color:#94a3b8;font-size:11px;">Órigo Access & Identity — Gestão de Identidades e Acessos</p>
    <p style="margin:6px 0 0;color:#cbd5e1;font-size:10px;">Este é um e-mail automático. Não responda.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function infoTable(rows: Array<[string, string]>): string {
  return `<table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
    ${rows.map(([l, v], i) => {
      const b = i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : "";
      return `<tr><td style="padding:14px 20px;color:#64748b;width:150px;font-size:13px;${b}">${l}</td><td style="padding:14px 20px;font-weight:600;color:#1e293b;font-size:14px;${b}">${v}</td></tr>`;
    }).join("")}
  </table>`;
}

const roleLabels: Record<string, string> = { admin: "Administrador", operador: "Operador", viewer: "Visualizador" };

function welcomeEmail(nome: string, email: string, senha: string, role: string) {
  return {
    subject: `[Órigo Access & Identity] Bem-vindo — ${nome}`,
    html: baseLayout("Bem-vindo ao Sistema",
      `<p style="font-size:16px;">Olá <strong>${nome}</strong>,</p>
      <p>Sua conta no <strong>Órigo Access & Identity</strong> foi criada com sucesso. Abaixo estão seus dados de acesso:</p>
      ${infoTable([
        ["E-mail", email],
        ["Senha temporária", `<span style="font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px;color:${BRAND_COLOR}">${senha}</span>`],
        ["Perfil", roleLabels[role] || role],
      ])}
      <div style="background:#fef3cd;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;color:#92400e;font-size:13px;margin:20px 0;line-height:1.6">
        ⚠️ <strong>Importante:</strong> No seu primeiro login você será solicitado a alterar a senha temporária por uma de sua escolha.
      </div>`,
      BASE_URL, "Acessar o Sistema"),
  };
}

function resetEmail(nome: string, email: string, senha: string) {
  return {
    subject: `[Órigo Access & Identity] Sua senha foi redefinida`,
    html: baseLayout("Senha Redefinida",
      `<p style="font-size:16px;">Olá <strong>${nome}</strong>,</p>
      <p>Um administrador redefiniu a senha da sua conta no <strong>Órigo Access & Identity</strong>. Use as credenciais abaixo para acessar:</p>
      ${infoTable([
        ["E-mail", email],
        ["Nova senha temporária", `<span style="font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px;color:${BRAND_COLOR}">${senha}</span>`],
      ])}
      <div style="background:#fef3cd;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;color:#92400e;font-size:13px;margin:20px 0;line-height:1.6">
        ⚠️ <strong>Importante:</strong> Por segurança, você será solicitado a alterar essa senha no próximo login.
      </div>
      <p style="color:#64748b;font-size:12px;">Se você não solicitou essa redefinição, entre em contato com o administrador imediatamente.</p>`,
      BASE_URL, "Acessar o Sistema"),
  };
}

async function audit(sb: any, acao: string, resumo: string, detalhes: any) {
  try {
    await sb.from("auditoria").insert({
      acao, entidade: "profiles", resumo, operador: "sistema", detalhes,
    });
  } catch (e) {
    console.error("[admin-create-user] audit error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();

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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- RESET PASSWORD ---
    if (body.action === "reset_password") {
      if (!body.user_id || !body.password || body.password.length < 8) {
        return new Response(JSON.stringify({ error: "user_id e senha (mín. 8 caracteres) obrigatórios" }), { status: 400, headers: corsHeaders });
      }
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (resetErr) return new Response(JSON.stringify({ error: resetErr.message }), { status: 400, headers: corsHeaders });

      // Force password change on next login
      await adminClient.from("profiles").update({ must_change_password: true }).eq("id", body.user_id);

      // Fetch profile for email
      const { data: prof } = await adminClient.from("profiles").select("nome,email").eq("id", body.user_id).maybeSingle();
      let email_enviado = false;
      let email_erro: string | undefined;
      if (prof?.email) {
        const tpl = resetEmail(prof.nome || prof.email, prof.email, body.password);
        const r = await sendEmail({ to: prof.email, subject: tpl.subject, htmlContent: tpl.html });
        email_enviado = r.success;
        email_erro = r.error;
        await audit(adminClient, "resetar_senha", `Senha redefinida para ${prof.email}: e-mail ${r.success ? "enviado" : "falhou"}`, { user_id: body.user_id, email: prof.email, email_enviado, email_erro });
      }
      return new Response(JSON.stringify({ success: true, email_enviado, email_erro, message: "Senha atualizada com sucesso." }), { headers: corsHeaders });
    }

    // --- CREATE USER ---
    const { email, nome, role, password } = body;
    if (!email || !nome) {
      return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), { status: 400, headers: corsHeaders });
    }
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: "Senha é obrigatória (mínimo 8 caracteres)" }), { status: 400, headers: corsHeaders });
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

    let email_enviado = false;
    let email_erro: string | undefined;
    if (newUser?.user) {
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });
      // Ensure flag (column default is true, but make it explicit)
      await adminClient.from("profiles").update({ must_change_password: true, nome, email }).eq("id", newUser.user.id);

      const tpl = welcomeEmail(nome, email, password, role);
      const r = await sendEmail({ to: email, subject: tpl.subject, htmlContent: tpl.html });
      email_enviado = r.success;
      email_erro = r.error;
      await audit(adminClient, "criar_usuario", `Usuário ${email} criado (${role}): e-mail ${r.success ? "enviado" : "falhou"}`, { user_id: newUser.user.id, email, role, email_enviado, email_erro });
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: newUser?.user?.id,
      email_enviado,
      email_erro,
      message: `Usuário ${email} criado com sucesso.`,
    }), { headers: corsHeaders });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[admin-create-user] error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
