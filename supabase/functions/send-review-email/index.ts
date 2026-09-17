import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail } from "../_shared/sendgrid.ts";
import { requireRoleOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const APP_URL = (Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app").replace(/\/$/, "");
const LOGO_URL = "https://iam.origoenergia.com.br/email/logo-origo.png";
const BRAND_COLOR = "#16968D";
const BRAND_DARK = "#0d8276";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { revisao_id } = await req.json();
    if (!revisao_id) {
      return new Response(JSON.stringify({ error: "revisao_id é obrigatório" }), { status: 400, headers: corsHeaders });
    }

    const { data: revisao, error: revErr } = await supabase
      .from("revisoes")
      .select("*, aplicacoes(nome), gestor:colaboradores(nome)")
      .eq("id", revisao_id)
      .single();

    if (revErr || !revisao) {
      return new Response(JSON.stringify({ error: "Revisão não encontrada" }), { status: 404, headers: corsHeaders });
    }

    const ownerEmail = revisao.owner_email;
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: "Owner sem e-mail configurado" }), { status: 400, headers: corsHeaders });
    }

    const isGestor = revisao.tipo === "gestor";
    const isTerceiros = revisao.tipo === "terceiros";
    const appName = isTerceiros ? `terceiros sob responsabilidade de ${revisao.gestor?.nome || revisao.responsavel || "você"}`
      : isGestor ? `equipe de ${revisao.gestor?.nome || revisao.responsavel || "gestor"}` : (revisao.aplicacoes?.nome || "Aplicação");
    const reviewUrl = `${APP_URL}/revisao-externa/${revisao.token}`;
    const dataFim = revisao.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : null;
    const total = revisao.total_itens ?? 0;

    const htmlContent = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06)">
  <!-- Header with Logo -->
  <tr><td style="background:linear-gradient(135deg,#1a1f2c 0%,#2d3748 100%);padding:28px 40px;text-align:center;">
    <img src="${LOGO_URL}" alt="Órigo" width="160" height="auto" style="display:block;margin:0 auto 12px;max-width:160px;" />
    <div style="width:40px;height:2px;background:${BRAND_COLOR};margin:0 auto 12px;border-radius:2px;"></div>
    <p style="margin:0;color:#94a3b8;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;">${isTerceiros ? "Revalidação de Terceiros" : "Revisão de Acesso"}</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 40px 28px;color:#1e293b;font-size:14px;line-height:1.8;">
    <p style="font-size:16px;">Olá,</p>
    <p>${isTerceiros
      ? `Chegou a hora de revalidar os <strong>${appName}</strong>. Para cada terceiro, confirme se o acesso continua necessário (<strong>Manter</strong>) ou se deve ser encerrado (<strong>Desligar</strong>).`
      : isGestor
      ? `Chegou a hora de revisar os acessos da sua <strong>${appName}</strong>. Como gestor, você decide, para cada acesso, se a pessoa <strong>mantém</strong> ou <strong>perde</strong> o acesso.`
      : `Uma nova campanha de revisão de acesso foi criada para a aplicação <strong>${appName}</strong>. Como owner, você decide quem <strong>mantém</strong> e quem <strong>perde</strong> o acesso.`}</p>
    <p>${isTerceiros ? "Os desligamentos que você decidir são executados automaticamente pelo Órigo Agente (contas desabilitadas e acessos removidos)." : "As revogações que você decidir são executadas automaticamente pelo Órigo Agente — não há outra etapa de aprovação."}</p>
    ${dataFim ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:14px 18px;color:#991b1b;font-size:13px;margin:20px 0;line-height:1.6"><strong>⏰ Prazo limite:</strong> ${dataFim}${isTerceiros ? " — <strong>sem resposta até essa data, os terceiros desta lista são desativados automaticamente.</strong>" : ""}</div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
      <tr><td style="padding:14px 20px;color:#64748b;width:150px;font-size:13px;border-bottom:1px solid #e2e8f0">${isTerceiros || isGestor ? "Escopo" : "Aplicação"}</td><td style="padding:14px 20px;font-weight:600;color:#1e293b;font-size:14px;border-bottom:1px solid #e2e8f0">${appName}</td></tr>
      <tr><td style="padding:14px 20px;color:#64748b;width:150px;font-size:13px;border-bottom:1px solid #e2e8f0">${isTerceiros ? "Terceiros a revalidar" : "Acessos a revisar"}</td><td style="padding:14px 20px;font-weight:600;color:#1e293b;font-size:14px;border-bottom:1px solid #e2e8f0">${total}</td></tr>
      ${dataFim ? `<tr><td style="padding:14px 20px;color:#64748b;width:150px;font-size:13px;">Prazo</td><td style="padding:14px 20px;font-weight:600;color:#dc2626;font-size:14px;">${dataFim}</td></tr>` : ""}
    </table>
  </td></tr>
  <!-- CTA -->
  <tr><td style="padding:0 40px 36px;text-align:center;">
    <a href="${reviewUrl}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_COLOR};background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(22,150,141,0.3);mso-padding-alt:14px 40px;">${isTerceiros ? "Revalidar Terceiros" : "Iniciar Revisão"}</a>
  </td></tr>
  <tr><td style="padding:0 40px 28px;">
    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
      Se o botão não funcionar, copie e cole este link no navegador:<br>
      <a href="${reviewUrl}" style="color:${BRAND_COLOR};word-break:break-all;font-size:11px;">${reviewUrl}</a>
    </p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:500;">Órigo Access & Identity — Gestão de Identidades e Acessos</p>
    <p style="margin:6px 0 0;color:#cbd5e1;font-size:10px;">Este é um e-mail automático. Não responda.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

    console.log(`[REVIEW EMAIL] Enviando para: ${ownerEmail}, App: ${appName}`);

    const result = await sendEmail({
      to: ownerEmail,
      subject: `[Órigo Access & Identity] ${isTerceiros ? "Revalidação de terceiros" : "Revisão de acesso"} — ${appName}${dataFim ? ` (até ${dataFim})` : ""}`,
      htmlContent,
    });

    await supabase.from("auditoria").insert({
      entidade: "revisao",
      entidade_id: revisao_id,
      acao: "email_revisao",
      resumo: result.success
        ? `E-mail de revisão enviado com sucesso para ${ownerEmail} (${appName})`
        : `Falha ao enviar e-mail para ${ownerEmail}: ${result.error}`,
      detalhes: {
        owner_email: ownerEmail,
        app_name: appName,
        review_url: reviewUrl,
        data_fim: dataFim,
        sendgrid_status: result.statusCode,
        success: result.success,
      },
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: `Falha no envio: ${result.error}` }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `E-mail enviado com sucesso para ${ownerEmail}`,
      review_url: reviewUrl,
    }), { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
