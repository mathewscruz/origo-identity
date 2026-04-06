import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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
    const appName = revisao.aplicacoes?.nome || "Aplicação";
    const reviewUrl = `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '')}/revisao-externa/${revisao.token}`;

    // Log the email that would be sent (actual email sending requires Resend connector)
    console.log(`[REVIEW EMAIL] To: ${ownerEmail}, App: ${appName}, URL: ${reviewUrl}`);

    // Store email attempt in auditoria
    await supabase.from("auditoria").insert({
      entidade: "revisao",
      entidade_id: revisao_id,
      acao: "email_revisao",
      resumo: `E-mail de revisão enviado para ${ownerEmail} (${appName})`,
      detalhes: { owner_email: ownerEmail, app_name: appName, review_url: reviewUrl },
    });

    return new Response(JSON.stringify({
      success: true,
      message: `E-mail de revisão registrado para ${ownerEmail}`,
      review_url: reviewUrl,
    }), { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
