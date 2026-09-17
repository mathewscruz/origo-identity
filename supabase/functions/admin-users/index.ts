// Gestão dos usuários do painel (profiles + user_roles + Auth) — só admin/platform_admin.
//   action: list | create | update | set_active | delete | reset_password
//   • desativar = profiles.ativo=false + bloqueio no Auth (ban) → sessão cai no próximo refresh
//   • reativar  = profiles.ativo=true + remove o bloqueio
//   • excluir   = auth.admin.deleteUser (profiles/user_roles caem em cascata)
//   Guardas: nunca contra si mesmo; nunca o último admin ativo; platform_admin só
//   pode ser concedido/alterado/removido por platform_admin. Tudo auditado com o
//   e-mail de quem operou.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const BASE_URL = (Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app").replace(/\/$/, "");
const LOGO_URL = "https://iam.origoenergia.com.br/email/logo-origo.png";
const BRAND_COLOR = "#16968D";
const BRAND_DARK = "#0d8276";
const ROLES = ["admin", "operador", "viewer", "platform_admin"] as const;
type Role = typeof ROLES[number];
const roleLabels: Record<string, string> = { admin: "Administrador", operador: "Operador", viewer: "Somente leitura", platform_admin: "Platform admin" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

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

const warn = (t: string) => `<div style="background:#fef3cd;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;color:#92400e;font-size:13px;margin:20px 0;line-height:1.6">⚠️ ${t}</div>`;
const pwd = (s: string) => `<span style="font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px;color:${BRAND_COLOR}">${s}</span>`;

function welcomeEmail(nome: string, email: string, senha: string, role: string) {
  return {
    subject: `[Órigo Access & Identity] Bem-vindo — ${nome}`,
    html: baseLayout("Bem-vindo ao Sistema",
      `<p style="font-size:16px;">Olá <strong>${nome}</strong>,</p>
      <p>Sua conta no <strong>Órigo Access & Identity</strong> foi criada. Dados de acesso:</p>
      ${infoTable([["E-mail", email], ["Senha temporária", pwd(senha)], ["Perfil", roleLabels[role] || role]])}
      ${warn("<strong>Importante:</strong> no primeiro login você será solicitado a trocar a senha temporária.")}`,
      BASE_URL, "Acessar o Sistema"),
  };
}
function resetEmail(nome: string, email: string, senha: string) {
  return {
    subject: `[Órigo Access & Identity] Sua senha foi redefinida`,
    html: baseLayout("Senha Redefinida",
      `<p style="font-size:16px;">Olá <strong>${nome}</strong>,</p>
      <p>Um administrador redefiniu a senha da sua conta no <strong>Órigo Access & Identity</strong>:</p>
      ${infoTable([["E-mail", email], ["Nova senha temporária", pwd(senha)]])}
      ${warn("<strong>Importante:</strong> por segurança, você será solicitado a trocar essa senha no próximo login.")}
      <p style="color:#64748b;font-size:12px;">Se você não solicitou essa redefinição, avise o administrador imediatamente.</p>`,
      BASE_URL, "Acessar o Sistema"),
  };
}
function statusEmail(nome: string, ativo: boolean, motivo?: string) {
  return {
    subject: `[Órigo Access & Identity] Seu acesso ao painel foi ${ativo ? "reativado" : "desativado"}`,
    html: baseLayout(ativo ? "Acesso Reativado" : "Acesso Desativado",
      `<p style="font-size:16px;">Olá <strong>${nome}</strong>,</p>
      <p>Seu acesso ao painel <strong>Órigo Access & Identity</strong> foi <strong>${ativo ? "reativado" : "desativado"}</strong> por um administrador.${motivo ? ` Motivo: ${motivo}` : ""}</p>
      ${ativo ? "" : "<p style=\"color:#64748b;font-size:12px;\">Se acredita que foi um engano, fale com o administrador da plataforma.</p>"}`,
      ativo ? BASE_URL : undefined, ativo ? "Acessar o Sistema" : undefined),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await anonClient.auth.getUser();
    if (claimsErr || !claims?.user) return json({ error: "Token inválido" }, 401);
    const me = claims.user;

    const { data: isAdmin } = await anonClient.rpc("has_role", { _user_id: me.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Acesso restrito a administradores" }, 403);
    const { data: iAmPlatform } = await anonClient.rpc("is_platform_admin", { _user_id: me.id });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const operador = me.email ?? me.id;

    const audit = async (acao: string, alvo: string | null, resumo: string, detalhes: Row) => {
      const { error } = await admin.from("auditoria").insert({ acao, entidade: "profiles", entidade_id: alvo, resumo, operador, detalhes });
      if (error) console.error("[admin-users] audit:", error.message);
    };
    const roleOf = async (userId: string): Promise<Role> => {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const roles = ((data ?? []) as Row[]).map((r) => r.role as Role);
      return (["platform_admin", "admin", "operador", "viewer"] as Role[]).find((r) => roles.includes(r)) ?? "viewer";
    };
    const activeAdmins = async (excluding: string): Promise<number> => {
      const { data } = await admin.from("user_roles").select("user_id, role").in("role", ["admin", "platform_admin"]);
      const ids = [...new Set(((data ?? []) as Row[]).map((r) => r.user_id as string))].filter((id) => id !== excluding);
      if (ids.length === 0) return 0;
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", ids).eq("ativo", true);
      return count ?? 0;
    };
    const targetProfile = async (userId: string) => {
      const { data } = await admin.from("profiles").select("id, nome, email, ativo").eq("id", userId).maybeSingle();
      return data as Row | null;
    };
    const canTouchRole = (role: Role) => role !== "platform_admin" || !!iAmPlatform;

    const action = String(body.action ?? "create");

    // ── LIST ──
    if (action === "list") {
      const { data, error } = await anonClient.rpc("admin_usuarios_resumo");
      if (error) return json({ error: error.message }, 500);
      return json({ users: data ?? [] });
    }

    // ── CREATE ──
    if (action === "create") {
      const { email, nome, role, password } = body;
      if (!email || !nome) return json({ error: "E-mail e nome são obrigatórios" }, 400);
      if (!password || String(password).length < 8) return json({ error: "Senha temporária obrigatória (mínimo 8 caracteres)" }, 400);
      if (!ROLES.includes(role)) return json({ error: "Papel inválido" }, 400);
      if (!canTouchRole(role)) return json({ error: "Somente platform_admin pode conceder platform_admin" }, 403);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({ email: String(email).trim().toLowerCase(), password, email_confirm: true, user_metadata: { nome } });
      if (createErr || !created?.user) return json({ error: createErr?.message || "Falha ao criar usuário" }, 400);
      const uid = created.user.id;
      await admin.from("user_roles").delete().eq("user_id", uid);
      await admin.from("user_roles").insert({ user_id: uid, role });
      await admin.from("profiles").upsert({ id: uid, nome, email: String(email).trim().toLowerCase(), ativo: true, must_change_password: true });
      const tpl = welcomeEmail(nome, email, password, role);
      const r = await sendEmail({ to: email, subject: tpl.subject, htmlContent: tpl.html });
      await audit("criar_usuario", uid, `Usuário ${email} criado (${roleLabels[role]}) por ${operador}; e-mail ${r.success ? "enviado" : "falhou"}`, { user_id: uid, email, role, email_enviado: r.success, email_erro: r.error });
      return json({ success: true, user_id: uid, email_enviado: r.success, email_erro: r.error });
    }

    // ações abaixo precisam de alvo
    const userId = String(body.user_id ?? "");
    if (!userId) return json({ error: "user_id obrigatório" }, 400);
    const alvo = await targetProfile(userId);
    if (!alvo) return json({ error: "Usuário não encontrado" }, 404);
    const alvoRole = await roleOf(userId);
    if (!canTouchRole(alvoRole) && action !== "reset_password") return json({ error: "Somente platform_admin pode alterar um platform_admin" }, 403);

    // ── UPDATE (nome, papel) ──
    if (action === "update") {
      const nome = String(body.nome ?? alvo.nome).trim();
      const role = (body.role ?? alvoRole) as Role;
      if (!nome) return json({ error: "Nome obrigatório" }, 400);
      if (!ROLES.includes(role)) return json({ error: "Papel inválido" }, 400);
      if (role !== alvoRole && !canTouchRole(role)) return json({ error: "Somente platform_admin pode conceder platform_admin" }, 403);
      if (role !== alvoRole && ["admin", "platform_admin"].includes(alvoRole) && !["admin", "platform_admin"].includes(role) && alvo.ativo && (await activeAdmins(userId)) === 0) {
        return json({ error: "Este é o último administrador ativo — promova outro antes de rebaixá-lo" }, 400);
      }
      if (role !== alvoRole && userId === me.id && !["admin", "platform_admin"].includes(role)) return json({ error: "Você não pode remover o próprio papel de administrador" }, 400);
      const { error: pErr } = await admin.from("profiles").update({ nome }).eq("id", userId);
      if (pErr) return json({ error: pErr.message }, 500);
      if (role !== alvoRole) {
        await admin.from("user_roles").delete().eq("user_id", userId);
        const { error: rErr } = await admin.from("user_roles").insert({ user_id: userId, role });
        if (rErr) return json({ error: rErr.message }, 500);
      }
      await audit("editar_usuario", userId, `Usuário ${alvo.email} editado por ${operador}${role !== alvoRole ? ` — papel ${roleLabels[alvoRole]} → ${roleLabels[role]}` : ""}`, { user_id: userId, nome, role_antes: alvoRole, role_depois: role });
      return json({ success: true });
    }

    // ── SET_ACTIVE (desativar/reativar + bloqueio no Auth) ──
    if (action === "set_active") {
      const ativo = !!body.ativo;
      if (userId === me.id && !ativo) return json({ error: "Você não pode desativar a própria conta" }, 400);
      if (!ativo && ["admin", "platform_admin"].includes(alvoRole) && alvo.ativo && (await activeAdmins(userId)) === 0) return json({ error: "Este é o último administrador ativo — não pode ser desativado" }, 400);
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: ativo ? "none" : "87600h" });
      if (banErr) return json({ error: banErr.message }, 400);
      const { error: pErr } = await admin.from("profiles").update({ ativo }).eq("id", userId);
      if (pErr) return json({ error: pErr.message }, 500);
      const tpl = statusEmail(alvo.nome || alvo.email, ativo, body.motivo ? String(body.motivo) : undefined);
      const r = alvo.email ? await sendEmail({ to: alvo.email, subject: tpl.subject, htmlContent: tpl.html }) : { success: false, error: "sem e-mail" };
      await audit(ativo ? "reativar_usuario" : "desativar_usuario", userId, `Usuário ${alvo.email} ${ativo ? "reativado" : "desativado (acesso bloqueado)"} por ${operador}${body.motivo ? ` — ${body.motivo}` : ""}`, { user_id: userId, ativo, motivo: body.motivo ?? null, email_enviado: r.success });
      return json({ success: true, ativo, email_enviado: r.success });
    }

    // ── DELETE (remoção definitiva) ──
    if (action === "delete") {
      if (userId === me.id) return json({ error: "Você não pode excluir a própria conta" }, 400);
      if (["admin", "platform_admin"].includes(alvoRole) && alvo.ativo && (await activeAdmins(userId)) === 0) return json({ error: "Este é o último administrador ativo — não pode ser excluído" }, 400);
      // auditoria antes (a linha do perfil some em cascata)
      await audit("excluir_usuario", userId, `Usuário ${alvo.email} (${roleLabels[alvoRole]}) excluído por ${operador}${body.motivo ? ` — ${body.motivo}` : ""}`, { user_id: userId, email: alvo.email, nome: alvo.nome, role: alvoRole, motivo: body.motivo ?? null });
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);
      await admin.from("profiles").delete().eq("id", userId); // caso o cascade não exista em algum ambiente
      return json({ success: true });
    }

    // ── RESET_PASSWORD ──
    if (action === "reset_password") {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Senha (mín. 8 caracteres) obrigatória" }, 400);
      const { error: resetErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (resetErr) return json({ error: resetErr.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
      const tpl = resetEmail(alvo.nome || alvo.email, alvo.email, password);
      const r = alvo.email ? await sendEmail({ to: alvo.email, subject: tpl.subject, htmlContent: tpl.html }) : { success: false, error: "sem e-mail" };
      await audit("resetar_senha", userId, `Senha de ${alvo.email} redefinida por ${operador}; e-mail ${r.success ? "enviado" : "falhou"}`, { user_id: userId, email_enviado: r.success, email_erro: r.error });
      return json({ success: true, email_enviado: r.success, email_erro: r.error });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[admin-users] error:", msg);
    return json({ error: msg }, 500);
  }
});
