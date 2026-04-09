import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app";
const LOGO_URL = "https://jobopjhhxgcfanlhzlkc.supabase.co/storage/v1/object/public/avatars/email%2Flogo-origo.png";
const BRAND_COLOR = "#16968D";
const BRAND_DARK = "#0d8276";

function baseLayout(title: string, body: string, actionUrl?: string, actionLabel?: string): string {
  const actionBlock = actionUrl && actionLabel ? `
    <tr><td style="padding:28px 40px 0;text-align:center;">
      <a href="${actionUrl}" style="display:inline-block;padding:14px 40px;background-color:${BRAND_COLOR};background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(22,150,141,0.3);mso-padding-alt:14px 40px;">${actionLabel}</a>
    </td></tr>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.06)">
  <!-- Header with Logo -->
  <tr><td style="background:linear-gradient(135deg,#1a1f2c 0%,#2d3748 100%);padding:28px 40px;text-align:center;">
    <img src="${LOGO_URL}" alt="Órigo" width="160" height="auto" style="display:block;margin:0 auto 12px;max-width:160px;" />
    <div style="width:40px;height:2px;background:${BRAND_COLOR};margin:0 auto 12px;border-radius:2px;"></div>
    <p style="margin:0;color:#94a3b8;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;">${title}</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:36px 40px 28px;color:#1e293b;font-size:14px;line-height:1.8;">${body}</td></tr>
  ${actionBlock}
  <!-- Footer -->
  <tr><td style="padding:32px 40px;border-top:1px solid #e2e8f0;margin-top:24px;text-align:center;">
    <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:500;">Órigo Access & Identity — Gestão de Identidades e Acessos</p>
    <p style="margin:6px 0 0;color:#cbd5e1;font-size:10px;">Este é um e-mail automático. Não responda.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function infoTable(rows: Array<[string, string]>): string {
  return `<table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
    ${rows.map(([label, value], i) => {
      const border = i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : "";
      return `<tr><td style="padding:14px 20px;color:#64748b;width:150px;font-size:13px;${border}">${label}</td><td style="padding:14px 20px;font-weight:600;color:#1e293b;font-size:14px;${border}">${value}</td></tr>`;
    }).join("")}
  </table>`;
}

type NotificationType =
  | "solicitacao_criada"
  | "solicitacao_decidida"
  | "excecao_criada"
  | "excecao_decidida"
  | "colaborador_desabilitado"
  | "terceiro_expirando"
  | "alerta_critico"
  | "revisao_concluida"
  | "revisao_lembrete"
  | "usuario_boas_vindas";

function buildEmail(tipo: NotificationType, p: Record<string, any>): { subject: string; html: string } | null {
  switch (tipo) {
    case "usuario_boas_vindas": {
      const roleLabels: Record<string, string> = { admin: "Administrador", operador: "Operador", viewer: "Visualizador" };
      return {
        subject: `[Órigo Access & Identity] Bem-vindo — ${p.nome}`,
        html: baseLayout("Bem-vindo ao Sistema",
          `<p style="font-size:16px;">Olá <strong>${p.nome}</strong>,</p>
          <p>Sua conta no <strong>Órigo Access & Identity</strong> foi criada com sucesso. Abaixo estão seus dados de acesso:</p>
          ${infoTable([
            ["E-mail", p.email],
            ["Senha temporária", `<span style="font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px;color:${BRAND_COLOR}">${p.senha}</span>`],
            ["Perfil", roleLabels[p.role] || p.role],
          ])}
          <div style="background:#fef3cd;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;color:#92400e;font-size:13px;margin:20px 0;line-height:1.6">
            ⚠️ <strong>Importante:</strong> Ao realizar seu primeiro login, você será solicitado a alterar a senha temporária por uma de sua escolha.
          </div>`,
          p.link || BASE_URL, "Acessar o Sistema"),
      };
    }
    case "solicitacao_criada":
      return {
        subject: `[Órigo Access & Identity] Nova solicitação de acesso — ${p.colaborador_nome}`,
        html: baseLayout("Nova Solicitação de Acesso",
          `<p>Uma nova solicitação de acesso foi criada e aguarda sua aprovação.</p>
          ${infoTable([
            ["Colaborador", p.colaborador_nome],
            ["Itens Solicitados", p.itens || "—"],
            ["Justificativa", p.justificativa || "—"],
            ["Solicitado por", p.solicitante || "—"],
          ])}`,
          `${BASE_URL}/solicitacoes`, "Ver Solicitação"),
      };
    case "solicitacao_decidida": {
      const statusColor = p.status === "aprovada" ? "#059669" : "#dc2626";
      const statusLabel = p.status === "aprovada" ? "Aprovada ✅" : "Rejeitada ❌";
      const rows: Array<[string, string]> = [
        ["Colaborador", p.colaborador_nome],
        ["Itens", p.itens || "—"],
        ["Aprovador", p.aprovador || "—"],
      ];
      if (p.comentario) rows.push(["Comentário", p.comentario]);
      return {
        subject: `[Órigo Access & Identity] Solicitação ${p.status} — ${p.colaborador_nome}`,
        html: baseLayout("Decisão sobre Solicitação",
          `<p>A solicitação de acesso foi <strong style="color:${statusColor}">${statusLabel}</strong>.</p>
          ${infoTable(rows)}`,
          `${BASE_URL}/solicitacoes`, "Ver Detalhes"),
      };
    }
    case "excecao_criada": {
      const rows: Array<[string, string]> = [
        ["Tipo", p.tipo_excecao === "manter_ativo" ? "Manter Ativo" : "Concessão de Acesso"],
        ["Colaborador", p.colaborador_nome],
      ];
      if (p.perfil) rows.push(["Perfil", p.perfil]);
      rows.push(["Justificativa", p.justificativa || "—"]);
      rows.push(["Solicitante", p.solicitante || "—"]);
      if (p.validade) rows.push(["Validade", p.validade]);
      return {
        subject: `[Órigo Access & Identity] Nova exceção de acesso — ${p.colaborador_nome}`,
        html: baseLayout("Nova Exceção de Acesso",
          `<p>Uma nova exceção de acesso foi solicitada e aguarda aprovação.</p>
          ${infoTable(rows)}`,
          `${BASE_URL}/excecoes`, "Ver Exceção"),
      };
    }
    case "excecao_decidida": {
      const sc = p.status === "aprovada" ? "#059669" : "#dc2626";
      const sl = p.status === "aprovada" ? "Aprovada ✅" : "Rejeitada ❌";
      const rows: Array<[string, string]> = [
        ["Colaborador", p.colaborador_nome],
        ["Aprovador", p.aprovador || "—"],
      ];
      if (p.comentario) rows.push(["Comentário", p.comentario]);
      return {
        subject: `[Órigo Access & Identity] Exceção ${p.status} — ${p.colaborador_nome}`,
        html: baseLayout("Decisão sobre Exceção",
          `<p>A exceção de acesso foi <strong style="color:${sc}">${sl}</strong>.</p>
          ${infoTable(rows)}`,
          `${BASE_URL}/excecoes`, "Ver Detalhes"),
      };
    }
    case "colaborador_desabilitado":
      return {
        subject: `[Órigo Access & Identity] Colaborador desabilitado — ${p.colaborador_nome}`,
        html: baseLayout("Colaborador Desabilitado",
          `<p>O colaborador abaixo teve seu status alterado e os acessos estão sendo processados.</p>
          ${infoTable([
            ["Colaborador", p.colaborador_nome],
            ["Status anterior", p.status_anterior || "Ativo"],
            ["Novo status", `<span style="color:#dc2626;font-weight:700">${p.novo_status}</span>`],
            ["Alterado por", p.operador || "—"],
          ])}`,
          `${BASE_URL}/colaboradores/${p.colaborador_id || ""}`, "Ver Colaborador"),
      };
    case "terceiro_expirando":
      return {
        subject: `[Órigo Access & Identity] Contrato expirando — ${p.terceiro_nome}`,
        html: baseLayout("Contrato de Terceiro Expirando",
          `<p>O contrato do terceiro abaixo está próximo do vencimento ou já expirou.</p>
          ${infoTable([
            ["Terceiro", p.terceiro_nome],
            ["Data de Expiração", `<span style="color:#dc2626;font-weight:700">${p.contrato_fim || "—"}</span>`],
            ["Responsável", p.responsavel || "—"],
          ])}`,
          `${BASE_URL}/terceiros/${p.terceiro_id || ""}`, "Ver Terceiro"),
      };
    case "alerta_critico":
      return {
        subject: `[Órigo Access & Identity] ⚠️ Alerta crítico — ${p.titulo}`,
        html: baseLayout("Alerta Crítico",
          `<div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;padding:14px 18px;color:#991b1b;font-size:14px;margin:0 0 20px;line-height:1.6;font-weight:600">
            ⚠️ Um alerta crítico foi gerado no sistema.
          </div>
          ${infoTable([
            ["Título", p.titulo],
            ["Mensagem", p.mensagem || "—"],
          ])}`,
          `${BASE_URL}/alertas`, "Ver Alertas"),
      };
    case "revisao_concluida":
      return {
        subject: `[Órigo Access & Identity] Revisão concluída — ${p.revisao_nome}`,
        html: baseLayout("Revisão Concluída",
          `<p>A campanha de revisão de acesso foi concluída.</p>
          ${infoTable([
            ["Campanha", p.revisao_nome],
            ["Total de Itens", String(p.total_itens || 0)],
            ["Mantidos", `<span style="color:#059669">${p.mantidos || 0}</span>`],
            ["Revogados", `<span style="color:#dc2626">${p.revogados || 0}</span>`],
          ])}`,
          `${BASE_URL}/revisoes/${p.revisao_id || ""}`, "Ver Revisão"),
      };
    case "revisao_lembrete":
      return {
        subject: `[Órigo Access & Identity] ⏰ Lembrete: revisão pendente — ${p.revisao_nome}`,
        html: baseLayout("Revisão Pendente",
          `<p>A revisão de acesso abaixo está com prazo próximo e ainda possui itens pendentes.</p>
          ${infoTable([
            ["Campanha", p.revisao_nome],
            ["Prazo", `<span style="color:#dc2626;font-weight:700">${p.prazo || "—"}</span>`],
            ["Itens Pendentes", `<strong>${p.pendentes || 0}</strong>`],
          ])}`,
          p.link_externo || `${BASE_URL}/revisoes/${p.revisao_id || ""}`, "Revisar Agora"),
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tipo, payload } = await req.json();
    if (!tipo || !payload) {
      return new Response(JSON.stringify({ error: "tipo e payload são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = payload.destinatario_email;
    if (!to) {
      console.warn(`[send-notification-email] Nenhum destinatário para tipo=${tipo}`);
      return new Response(JSON.stringify({ skipped: true, reason: "sem destinatário" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = buildEmail(tipo as NotificationType, payload);
    if (!email) {
      return new Response(JSON.stringify({ error: `Tipo desconhecido: ${tipo}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendEmail({ to, subject: email.subject, htmlContent: email.html });
    console.log(`[send-notification-email] tipo=${tipo} to=${to} success=${result.success}`);

    // Audit
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    await sb.from("auditoria").insert({
      acao: "enviar_email",
      entidade: "notificacao",
      resumo: `E-mail [${tipo}] para ${to}: ${result.success ? "enviado" : "falha"}`,
      operador: "sistema",
      detalhes: { tipo, to, success: result.success, statusCode: result.statusCode, error: result.error },
    });

    return new Response(JSON.stringify({ success: result.success, tipo }), {
      status: result.success ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[send-notification-email] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
