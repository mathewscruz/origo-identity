// Decisões de uma revisão feitas pelo link externo (owner da aplicação / gestor, sem login).
//   • token precisa existir e estar dentro da validade (revisoes.token_expires_at)
//   • grava as decisões (revisao_decidir_itens) e, se `concluir` (padrão), conclui a
//     campanha (revisao_concluir): revogações entram na fila JÁ APROVADAS — a decisão
//     do responsável é a aprovação — e o Órigo Agente executa
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, decisions, justificativas, concluir } = await req.json();
    if (!token || !decisions || typeof decisions !== "object") {
      return new Response(JSON.stringify({ error: "Missing token or decisions" }), { status: 400, headers: corsHeaders });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: revisao } = await supabase
      .from("revisoes").select("id, nome, owner_email, responsavel, status, token_expires_at").eq("token", token).maybeSingle();
    if (!revisao) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 403, headers: corsHeaders });
    if (revisao.token_expires_at && new Date(revisao.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Link expirado — solicite uma nova revisão" }), { status: 403, headers: corsHeaders });
    }
    if (revisao.status !== "em_andamento") {
      return new Response(JSON.stringify({ error: "Revisão já encerrada" }), { status: 400, headers: corsHeaders });
    }

    const decididoPor = revisao.owner_email || revisao.responsavel || "revisor externo";
    const { data: dec, error: decErr } = await supabase.rpc("revisao_decidir_itens", {
      p_revisao_id: revisao.id, p_decisoes: decisions, p_justificativas: justificativas ?? {}, p_decidido_por: decididoPor,
    });
    if (decErr) return new Response(JSON.stringify({ error: decErr.message }), { status: 500, headers: corsHeaders });
    if ((dec as Record<string, unknown>)?.ok === false) return new Response(JSON.stringify({ error: (dec as Record<string, unknown>).error }), { status: 400, headers: corsHeaders });

    if (concluir === false) {
      return new Response(JSON.stringify({ decididos: (dec as Record<string, unknown>)?.decididos ?? 0, concluida: false }), { headers: corsHeaders });
    }

    const { data: res, error: resErr } = await supabase.rpc("revisao_concluir", { p_revisao_id: revisao.id, p_decidido_por: decididoPor });
    if (resErr) return new Response(JSON.stringify({ error: resErr.message }), { status: 500, headers: corsHeaders });
    const r = (res ?? {}) as Record<string, unknown>;
    if (r.ok === false) return new Response(JSON.stringify({ error: r.error }), { status: 400, headers: corsHeaders });

    // confirmação ao responsável (best-effort)
    if (revisao.owner_email) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: serviceAuthHeader() },
        body: JSON.stringify({ tipo: "revisao_concluida", payload: { destinatario_email: revisao.owner_email, revisao_nome: revisao.nome, revisao_id: revisao.id, total_itens: Number(r.mantidos ?? 0) + Number(r.revogados ?? 0) + Number(r.pendentes ?? 0), mantidos: r.mantidos, revogados: r.revogados } }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ mantidos: r.mantidos ?? 0, revogados: r.revogados ?? 0, acoes: r.acoes ?? 0, pendentes: r.pendentes ?? 0, concluida: true }), { headers: corsHeaders });
  } catch (err) {
    console.error("[save-external-review]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});
