import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRoleOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  try {

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);

    // Buscar exceções tipo "acesso" aprovadas vencidas
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
      // 1) marcar como expirada
      await supabase.from("excecoes").update({ status: "expirada" }).eq("id", ex.id);

      if (!ex.colaborador_id || !ex.perfil_id) {
        expiradas++;
        continue;
      }

      // 2) desativar perfil_atribuicoes (preferindo a vinculada via excecao_id)
      const { data: atribs } = await supabase
        .from("perfil_atribuicoes")
        .select("id")
        .eq("colaborador_id", ex.colaborador_id)
        .eq("perfil_id", ex.perfil_id)
        .eq("ativo", true);

      if (atribs && atribs.length > 0) {
        await supabase
          .from("perfil_atribuicoes")
          .update({ ativo: false, data_revogacao: new Date().toISOString() })
          .in("id", atribs.map((a: any) => a.id));
      }

      // 3) buscar colaborador
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("id, nome, email, sam_account_name")
        .eq("id", ex.colaborador_id)
        .maybeSingle();

      const identity = colab?.email || colab?.sam_account_name || "";
      if (!identity) { expiradas++; continue; }

      // 4) enfileirar remoção de grupos/licenças/apps do perfil
      const [{ data: grupos }, { data: licencas }, { data: apps }] = await Promise.all([
        supabase.from("perfil_grupos").select("*, entra_grupos(nome, entra_id)").eq("perfil_id", ex.perfil_id),
        supabase.from("perfil_licencas").select("*, entra_licencas(nome, sku_id)").eq("perfil_id", ex.perfil_id),
        supabase.from("perfil_aplicacoes").select("*, aplicacoes(nome, entra_id)").eq("perfil_id", ex.perfil_id),
      ]);

      const queueRows: any[] = [];
      for (const g of grupos || []) {
        queueRows.push({
          action_type: "remove_group",
          payload_json: {
            displayName: colab?.nome || ex.colaborador_nome || "",
            mail: colab?.email || "",
            groupName: g.entra_grupos?.nome || "",
            groupId: g.entra_grupos?.entra_id || "",
          },
          target_identity: identity,
          requested_by: "sistema_expiracao_excecao",
          colaborador_id: ex.colaborador_id,
          status: "pending",
        });
      }
      for (const l of licencas || []) {
        queueRows.push({
          action_type: "remove_license",
          payload_json: {
            displayName: colab?.nome || ex.colaborador_nome || "",
            mail: colab?.email || "",
            licenseName: l.entra_licencas?.nome || "",
            skuId: l.entra_licencas?.sku_id || "",
          },
          target_identity: identity,
          requested_by: "sistema_expiracao_excecao",
          colaborador_id: ex.colaborador_id,
          status: "pending",
        });
      }
      for (const a of apps || []) {
        if (a.aplicacoes?.entra_id) {
          queueRows.push({
            action_type: "remove_app",
            payload_json: {
              displayName: colab?.nome || ex.colaborador_nome || "",
              mail: colab?.email || "",
              appName: a.aplicacoes?.nome || "",
              appId: a.aplicacoes?.entra_id || "",
            },
            target_identity: identity,
            requested_by: "sistema_expiracao_excecao",
            colaborador_id: ex.colaborador_id,
            status: "pending",
          });
        }
      }

      if (queueRows.length > 0) {
        await supabase.from("iam_queue").insert(queueRows);
        acoesGeradas += queueRows.length;
      }

      // 5) auditoria
      await supabase.from("auditoria").insert({
        acao: "expirar_excecao",
        entidade: "excecoes",
        entidade_id: ex.id,
        operador: "sistema",
        resumo: `Exceção expirada (${ex.colaborador_nome || "—"} / ${ex.perfil_solicitado || "—"}): ${queueRows.length} ações de remoção enfileiradas`,
      });

      expiradas++;
    }

    // dispara processamento se houve ações
    if (acoesGeradas > 0) {
      try {
        await supabase.functions.invoke("process-iam-queue", { body: {} });
      } catch (_) { /* ignore */ }
    }

    return new Response(JSON.stringify({ expiradas, acoesGeradas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
