import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, decisions } = await req.json();
    if (!token || !decisions || typeof decisions !== "object") {
      return new Response(JSON.stringify({ error: "Missing token or decisions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate token
    const { data: revisao, error: revErr } = await supabase
      .from("revisoes")
      .select("id, owner_email, status")
      .eq("token", token)
      .single();

    if (revErr || !revisao) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (revisao.status === "concluida") {
      return new Response(JSON.stringify({ error: "Review already completed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get items
    const { data: itens } = await supabase
      .from("revisao_itens")
      .select("id, colaborador_id, perfil_id, colaborador_nome, terceiro_id")
      .eq("revisao_id", revisao.id);

    const now = new Date().toISOString();
    let mantidos = 0;
    let revogados = 0;

    for (const item of (itens || [])) {
      const decisao = decisions[item.id];
      if (!decisao) continue;

      await supabase
        .from("revisao_itens")
        .update({ decisao, decidido_em: now })
        .eq("id", item.id);

      if (decisao === "manter") mantidos++;
      if (decisao === "revogar") {
        revogados++;

        if (!item.perfil_id) continue;

        // Resolve identidade (colaborador ou terceiro)
        let identity = "";
        let nome = item.colaborador_nome || "";
        let email = "";

        if (item.colaborador_id) {
          const { data: colab } = await supabase
            .from("colaboradores")
            .select("sam_account_name, nome, email")
            .eq("id", item.colaborador_id)
            .single();
          nome = colab?.nome || nome;
          email = colab?.email || "";
          identity = email || colab?.sam_account_name || "";

          await supabase.from("perfil_atribuicoes").update({
            ativo: false,
            data_revogacao: now,
          }).eq("colaborador_id", item.colaborador_id).eq("perfil_id", item.perfil_id).eq("ativo", true);
        } else if (item.terceiro_id) {
          const { data: terc } = await supabase
            .from("terceiros")
            .select("sam_account_name, nome, email")
            .eq("id", item.terceiro_id)
            .single();
          nome = terc?.nome || nome;
          email = terc?.email || "";
          identity = email || terc?.sam_account_name || "";

          await supabase.from("perfil_atribuicoes").update({
            ativo: false,
            data_revogacao: now,
          }).eq("terceiro_id", item.terceiro_id).eq("perfil_id", item.perfil_id).eq("ativo", true);
        }

        if (identity) {

            // Remove groups
            const { data: grupos } = await supabase
              .from("perfil_grupos")
              .select("*, entra_grupos(nome, entra_id)")
              .eq("perfil_id", item.perfil_id);

            for (const g of (grupos || [])) {
              await supabase.from("iam_queue").insert({
                action_type: "remove_group",
                payload_json: {
                  displayName: colab?.nome || item.colaborador_nome || "",
                  mail: colab?.email || "",
                  groupName: g.entra_grupos?.nome || "",
                  groupId: g.entra_grupos?.entra_id || "",
                },
                target_identity: identity,
                requested_by: revisao.owner_email || "revisao_externa",
                colaborador_id: item.colaborador_id,
                status: "pending",
              });
            }

            // Remove licenses
            const { data: licencas } = await supabase
              .from("perfil_licencas")
              .select("*, entra_licencas(nome, sku_id)")
              .eq("perfil_id", item.perfil_id);

            for (const l of (licencas || [])) {
              await supabase.from("iam_queue").insert({
                action_type: "remove_license",
                payload_json: {
                  displayName: colab?.nome || item.colaborador_nome || "",
                  mail: colab?.email || "",
                  licenseName: l.entra_licencas?.nome || "",
                  skuId: l.entra_licencas?.sku_id || "",
                },
                target_identity: identity,
                requested_by: revisao.owner_email || "revisao_externa",
                colaborador_id: item.colaborador_id,
                status: "pending",
              });
            }

            // Remove apps
            const { data: apps } = await supabase
              .from("perfil_aplicacoes")
              .select("*, aplicacoes(nome, entra_id)")
              .eq("perfil_id", item.perfil_id);

            for (const a of (apps || [])) {
              if (a.aplicacoes?.entra_id) {
                await supabase.from("iam_queue").insert({
                  action_type: "remove_app",
                  payload_json: {
                    displayName: colab?.nome || item.colaborador_nome || "",
                    mail: colab?.email || "",
                    appName: a.aplicacoes?.nome || "",
                    appId: a.aplicacoes?.entra_id || "",
                  },
                  target_identity: identity,
                  requested_by: revisao.owner_email || "revisao_externa",
                  colaborador_id: item.colaborador_id,
                  status: "pending",
                });
              }
            }
          }
        }
      }
    }

    // Mark review as completed
    const revisados = Object.keys(decisions).length;
    await supabase.from("revisoes").update({
      itens_revisados: revisados,
      status: "concluida",
    }).eq("id", revisao.id);

    // Audit
    await supabase.from("auditoria").insert({
      entidade: "revisao",
      entidade_id: revisao.id,
      acao: "revisao_externa",
      operador: revisao.owner_email || "owner",
      resumo: `Revisão externa concluída: ${mantidos} mantidos, ${revogados} revogados`,
      detalhes: { mantidos, revogados, total: (itens || []).length, decisoes: decisions },
    });

    return new Response(JSON.stringify({ mantidos, revogados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
