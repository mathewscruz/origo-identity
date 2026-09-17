// Expira exceções de acesso vencidas (tipo "acesso" aprovadas com validade < hoje):
// marca como expirada, desativa a atribuição do perfil e enfileira a remoção dos
// recursos que NENHUM outro perfil ativo concede (RPC iam_enqueue_profile_actions).
// Agendada via pg_cron (05:00 UTC) — aceita service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRoleOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date().toISOString().slice(0, 10);

    const { data: vencidas, error } = await supabase
      .from("excecoes")
      .select("id, colaborador_id, perfil_id, validade, colaborador_nome, perfil_solicitado")
      .eq("tipo_excecao", "acesso")
      .eq("status", "aprovada")
      .not("validade", "is", null)
      .lt("validade", today);
    if (error) throw error;

    let expiradas = 0;
    let acoesGeradas = 0;
    for (const ex of vencidas || []) {
      await supabase.from("excecoes").update({ status: "expirada", data_decisao: new Date().toISOString() }).eq("id", ex.id);
      expiradas++;
      if (!ex.colaborador_id || !ex.perfil_id) continue;

      // desativa a(s) atribuição(ões) ligadas à exceção (ou do perfil, se não houver vínculo)
      const { data: viaExcecao } = await supabase.from("perfil_atribuicoes").select("id").eq("excecao_id", ex.id).eq("ativo", true);
      const ids = (viaExcecao || []).map((a: { id: string }) => a.id);
      if (ids.length === 0) {
        const { data: viaPerfil } = await supabase.from("perfil_atribuicoes").select("id").eq("colaborador_id", ex.colaborador_id).eq("perfil_id", ex.perfil_id).eq("ativo", true).neq("origem", "cargo");
        ids.push(...(viaPerfil || []).map((a: { id: string }) => a.id));
      }
      if (ids.length > 0) {
        await supabase.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() }).in("id", ids);
      }

      // remove só o que deixou de ser concedido (outros perfis ativos / concessões individuais são respeitados)
      const { data: n, error: rpcErr } = await supabase.rpc("iam_enqueue_profile_actions", {
        p_colaborador_id: ex.colaborador_id, p_terceiro_id: null, p_perfil_ids: [ex.perfil_id],
        p_mode: "remove", p_requested_by: "sistema_expiracao_excecao", p_status: "pending", p_motivo: `excecao_expirada:${ex.id}`,
      });
      if (rpcErr) console.error(`[expire] ${ex.id}: ${rpcErr.message}`);
      const queued = Number(n) || 0;
      acoesGeradas += queued;

      await supabase.from("auditoria").insert({
        acao: "expirar_excecao", entidade: "excecoes", entidade_id: ex.id, operador: "sistema",
        resumo: `Exceção expirada (${ex.colaborador_nome || "—"} / ${ex.perfil_solicitado || "—"}): ${ids.length} atribuição(ões) desativada(s), ${queued} remoção(ões) enfileirada(s)`,
      });
    }

    // os itens enfileirados são executados pelo Órigo Agente (iam-agent-api)
    return new Response(JSON.stringify({ expiradas, acoesGeradas }), { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
