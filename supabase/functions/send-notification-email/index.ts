import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = Deno.env.get("SITE_URL") || "https://origo-identity.lovable.app";
const BRAND_COLOR = "#16968D";
const BRAND_DARK = "#0d8276";

function baseLayout(title: string, body: string, actionUrl?: string, actionLabel?: string): string {
  const actionBlock = actionUrl && actionLabel ? `
    <tr><td style="padding:24px 40px 0">
      <a href="${actionUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_DARK});color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${actionLabel}</a>
    </td></tr>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
  <tr><td style="background:linear-gradient(135deg,#1a1f2c,#2d3748);padding:32px 40px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Origo Identity</h1>
    <p style="margin:8px 0 0;color:#a0aec0;font-size:13px;">${title}</p>
  </td></tr>
  <tr><td style="padding:32px 40px 24px;color:#1a202c;font-size:14px;line-height:1.7;">${body}</td></tr>
  ${actionBlock}
  <tr><td style="padding:32px 40px;border-top:1px solid #e2e8f0;margin-top:24px;">
    <p style="margin:0;color:#a0aec0;font-size:11px;">Origo Identity — Gestão de Identidades e Acessos</p>
    <p style="margin:4px 0 0;color:#cbd5e0;font-size:10px;">Este é um e-mail automático. Não responda.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
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
        subject: `Bem-vindo ao Origo Identity — ${p.nome}`,
        html: baseLayout("Bem-vindo ao Origo Identity",
          `<p>Olá <strong>${p.nome}</strong>,</p>
          <p>Sua conta no <strong>Origo Identity</strong> foi criada com sucesso. Abaixo estão seus dados de acesso:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f7fafc;border-radius:8px;overflow:hidden">
            <tr><td style="padding:12px 16px;color:#718096;width:140px;border-bottom:1px solid #e2e8f0">E-mail</td><td style="padding:12px 16px;font-weight:600;border-bottom:1px solid #e2e8f0">${p.email}</td></tr>
            <tr><td style="padding:12px 16px;color:#718096;border-bottom:1px solid #e2e8f0">Senha temporária</td><td style="padding:12px 16px;font-weight:600;font-family:monospace;font-size:16px;letter-spacing:1px;border-bottom:1px solid #e2e8f0">${p.senha}</td></tr>
            <tr><td style="padding:12px 16px;color:#718096">Perfil</td><td style="padding:12px 16px;font-weight:600">${roleLabels[p.role] || p.role}</td></tr>
          </table>
          <p style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;color:#856404;font-size:13px;margin:16px 0">
            ⚠️ <strong>Importante:</strong> Ao realizar seu primeiro login, você será solicitado a alterar a senha temporária por uma de sua escolha.
          </p>`,
          p.link || BASE_URL, "Acessar o Sistema"),
      };
    }
    case "solicitacao_criada":
      return {
        subject: `Nova solicitação de acesso — ${p.colaborador_nome}`,
        html: baseLayout("Nova Solicitação de Acesso",
          `<p>Uma nova solicitação de acesso foi criada e aguarda sua aprovação.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Colaborador</td><td style="padding:8px 0;font-weight:600">${p.colaborador_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Itens Solicitados</td><td style="padding:8px 0;font-weight:600">${p.itens || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Justificativa</td><td style="padding:8px 0">${p.justificativa || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Solicitado por</td><td style="padding:8px 0">${p.solicitante || "—"}</td></tr>
          </table>`,
          `${BASE_URL}/solicitacoes`, "Ver Solicitação"),
      };
    case "solicitacao_decidida": {
      const statusColor = p.status === "aprovada" ? "#38a169" : "#e53e3e";
      const statusLabel = p.status === "aprovada" ? "Aprovada ✅" : "Rejeitada ❌";
      return {
        subject: `Solicitação ${p.status} — ${p.colaborador_nome}`,
        html: baseLayout("Decisão sobre Solicitação de Acesso",
          `<p>A solicitação de acesso foi <strong style="color:${statusColor}">${statusLabel}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Colaborador</td><td style="padding:8px 0;font-weight:600">${p.colaborador_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Itens</td><td style="padding:8px 0">${p.itens || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Aprovador</td><td style="padding:8px 0">${p.aprovador || "—"}</td></tr>
            ${p.comentario ? `<tr><td style="padding:8px 0;color:#718096">Comentário</td><td style="padding:8px 0">${p.comentario}</td></tr>` : ""}
          </table>`,
          `${BASE_URL}/solicitacoes`, "Ver Detalhes"),
      };
    }
    case "excecao_criada":
      return {
        subject: `Nova exceção de acesso — ${p.colaborador_nome}`,
        html: baseLayout("Nova Exceção de Acesso",
          `<p>Uma nova exceção de acesso foi solicitada e aguarda aprovação.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Tipo</td><td style="padding:8px 0;font-weight:600">${p.tipo_excecao === "manter_ativo" ? "Manter Ativo" : "Concessão de Acesso"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Colaborador</td><td style="padding:8px 0;font-weight:600">${p.colaborador_nome}</td></tr>
            ${p.perfil ? `<tr><td style="padding:8px 0;color:#718096">Perfil</td><td style="padding:8px 0">${p.perfil}</td></tr>` : ""}
            <tr><td style="padding:8px 0;color:#718096">Justificativa</td><td style="padding:8px 0">${p.justificativa || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Solicitante</td><td style="padding:8px 0">${p.solicitante || "—"}</td></tr>
            ${p.validade ? `<tr><td style="padding:8px 0;color:#718096">Validade</td><td style="padding:8px 0">${p.validade}</td></tr>` : ""}
          </table>`,
          `${BASE_URL}/excecoes`, "Ver Exceção"),
      };
    case "excecao_decidida": {
      const sc = p.status === "aprovada" ? "#38a169" : "#e53e3e";
      const sl = p.status === "aprovada" ? "Aprovada ✅" : "Rejeitada ❌";
      return {
        subject: `Exceção ${p.status} — ${p.colaborador_nome}`,
        html: baseLayout("Decisão sobre Exceção de Acesso",
          `<p>A exceção de acesso foi <strong style="color:${sc}">${sl}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Colaborador</td><td style="padding:8px 0;font-weight:600">${p.colaborador_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Aprovador</td><td style="padding:8px 0">${p.aprovador || "—"}</td></tr>
            ${p.comentario ? `<tr><td style="padding:8px 0;color:#718096">Comentário</td><td style="padding:8px 0">${p.comentario}</td></tr>` : ""}
          </table>`,
          `${BASE_URL}/excecoes`, "Ver Detalhes"),
      };
    }
    case "colaborador_desabilitado":
      return {
        subject: `Colaborador desabilitado — ${p.colaborador_nome}`,
        html: baseLayout("Colaborador Desabilitado",
          `<p>O colaborador abaixo teve seu status alterado e os acessos estão sendo processados.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Colaborador</td><td style="padding:8px 0;font-weight:600">${p.colaborador_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Status anterior</td><td style="padding:8px 0">${p.status_anterior || "ativo"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Novo status</td><td style="padding:8px 0;font-weight:600;color:#e53e3e">${p.novo_status}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Alterado por</td><td style="padding:8px 0">${p.operador || "—"}</td></tr>
          </table>`,
          `${BASE_URL}/colaboradores/${p.colaborador_id || ""}`, "Ver Colaborador"),
      };
    case "terceiro_expirando":
      return {
        subject: `Contrato expirando — ${p.terceiro_nome}`,
        html: baseLayout("Contrato de Terceiro Expirando",
          `<p>O contrato do terceiro abaixo está próximo do vencimento ou já expirou.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Terceiro</td><td style="padding:8px 0;font-weight:600">${p.terceiro_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Data de Expiração</td><td style="padding:8px 0;font-weight:600;color:#e53e3e">${p.contrato_fim || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Responsável</td><td style="padding:8px 0">${p.responsavel || "—"}</td></tr>
          </table>`,
          `${BASE_URL}/terceiros/${p.terceiro_id || ""}`, "Ver Terceiro"),
      };
    case "alerta_critico":
      return {
        subject: `⚠️ Alerta crítico — ${p.titulo}`,
        html: baseLayout("Alerta Crítico do Sistema",
          `<p style="color:#e53e3e;font-weight:600;">Um alerta crítico foi gerado no sistema.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Título</td><td style="padding:8px 0;font-weight:600">${p.titulo}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Mensagem</td><td style="padding:8px 0">${p.mensagem || "—"}</td></tr>
          </table>`,
          `${BASE_URL}/alertas`, "Ver Alertas"),
      };
    case "revisao_concluida":
      return {
        subject: `Revisão concluída — ${p.revisao_nome}`,
        html: baseLayout("Revisão de Acesso Concluída",
          `<p>A campanha de revisão de acesso foi concluída.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Campanha</td><td style="padding:8px 0;font-weight:600">${p.revisao_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Total de Itens</td><td style="padding:8px 0">${p.total_itens || 0}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Mantidos</td><td style="padding:8px 0;color:#38a169;font-weight:600">${p.mantidos || 0}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Revogados</td><td style="padding:8px 0;color:#e53e3e;font-weight:600">${p.revogados || 0}</td></tr>
          </table>`,
          `${BASE_URL}/revisoes/${p.revisao_id || ""}`, "Ver Revisão"),
      };
    case "revisao_lembrete":
      return {
        subject: `⏰ Lembrete: revisão pendente — ${p.revisao_nome}`,
        html: baseLayout("Lembrete de Revisão Pendente",
          `<p>A revisão de acesso abaixo está com prazo próximo e ainda possui itens pendentes.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#718096;width:140px">Campanha</td><td style="padding:8px 0;font-weight:600">${p.revisao_nome}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Prazo</td><td style="padding:8px 0;font-weight:600;color:#e53e3e">${p.prazo || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#718096">Itens Pendentes</td><td style="padding:8px 0;font-weight:600">${p.pendentes || 0}</td></tr>
          </table>`,
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
