import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const APP_URL = "https://origo-identity.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      .select("*, aplicacoes(nome)")
      .eq("id", revisao_id)
      .single();

    if (revErr || !revisao) {
      return new Response(JSON.stringify({ error: "Revisão não encontrada" }), { status: 404, headers: corsHeaders });
    }

    const ownerEmail = revisao.owner_email;
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: "Owner sem e-mail configurado" }), { status: 400, headers: corsHeaders });
    }

    const appName = revisao.aplicacoes?.nome || "Aplicação";
    const reviewUrl = `${APP_URL}/revisao-externa/${revisao.token}`;
    const dataFim = revisao.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : null;

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #1a1f2c, #2d3748); padding: 32px 24px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 22px;">Revisão de Acesso</h1>
      <p style="color: #a0aec0; margin: 8px 0 0; font-size: 14px;">Origo Identity</p>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #2d3748; font-size: 16px; margin: 0 0 16px;">Olá,</p>
      <p style="color: #4a5568; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        Uma nova campanha de revisão de acesso foi criada para a aplicação <strong>${appName}</strong>.
        Como owner, você precisa revisar os acessos dos colaboradores e terceiros listados.
      </p>
      ${dataFim ? `<p style="color: #e53e3e; font-size: 14px; margin: 0 0 20px;"><strong>⏰ Prazo limite:</strong> ${dataFim}</p>` : ""}
      <div style="text-align: center; margin: 28px 0;">
        <a href="${reviewUrl}" style="background: linear-gradient(135deg, #16968D, #0d8276); color: #fff; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
          Iniciar Revisão
        </a>
      </div>
      <p style="color: #718096; font-size: 13px; margin: 24px 0 0; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        <a href="${reviewUrl}" style="color: #16968D; word-break: break-all;">${reviewUrl}</a>
      </p>
    </div>
    <div style="background: #f7fafc; padding: 16px 24px; text-align: center;">
      <p style="color: #a0aec0; font-size: 12px; margin: 0;">Origo Identity — Gestão de Identidades e Acessos</p>
    </div>
  </div>
</body>
</html>`;

    console.log(`[REVIEW EMAIL] Enviando para: ${ownerEmail}, App: ${appName}`);

    const result = await sendEmail({
      to: ownerEmail,
      subject: `Revisão de Acesso — ${appName}`,
      htmlContent,
    });

    // Registrar na auditoria
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
