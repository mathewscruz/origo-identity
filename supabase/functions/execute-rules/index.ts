import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Execute-rules: Manual-only rule execution engine.
 * 
 * Accepts POST with JSON body:
 *   { regra_id: string, execute: boolean }
 * 
 * - execute=false (default): Simulate — returns list of actions without persisting
 * - execute=true: Actually create perfil_atribuicoes records
 * 
 * This function is NEVER called automatically. Only triggered by UI button clicks.
 */

interface RuleCondition {
  campo: string;
  operador: string;
  valor: string;
}

interface RuleResult {
  tipo: string;
  perfil_id: string | null;
  perfil_nome?: string;
}

function evaluateCondition(cond: RuleCondition, colab: any): boolean {
  let fieldValue = "";

  switch (cond.campo) {
    case "cargo":
      fieldValue = colab.cargos?.nome || "";
      break;
    case "area":
      fieldValue = colab.areas?.nome || "";
      break;
    case "empresa":
      fieldValue = colab.empresas?.nome || "";
      break;
    case "localidade":
      fieldValue = colab.localidades?.nome || "";
      break;
    case "status":
      fieldValue = colab.status || "";
      break;
    default:
      fieldValue = colab[cond.campo] || "";
  }

  const fv = fieldValue.toLowerCase().trim();
  const cv = cond.valor.toLowerCase().trim();

  switch (cond.operador) {
    case "igual":
      return fv === cv;
    case "diferente":
      return fv !== cv;
    case "em_lista": {
      const list = cv.split(",").map(s => s.trim());
      return list.includes(fv);
    }
    case "nao_em_lista": {
      const list = cv.split(",").map(s => s.trim());
      return !list.includes(fv);
    }
    default:
      return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const regraId = body.regra_id;
    const shouldExecute = body.execute === true;

    if (!regraId) {
      return new Response(JSON.stringify({ error: "regra_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load the rule
    const { data: regra, error: regraErr } = await sb.from("regras").select("*").eq("id", regraId).single();
    if (regraErr || !regra) {
      return new Response(JSON.stringify({ error: "Regra não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load conditions
    const { data: condicoes } = await sb.from("regra_condicoes").select("*").eq("regra_id", regraId).order("ordem");
    if (!condicoes || condicoes.length === 0) {
      return new Response(JSON.stringify({ error: "Regra sem condições definidas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Load results with perfil names
    const { data: resultados } = await sb.from("regra_resultados").select("*, perfis_acesso(nome)").eq("regra_id", regraId).order("ordem");
    if (!resultados || resultados.length === 0) {
      return new Response(JSON.stringify({ error: "Regra sem resultados definidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Load all active colaboradores with joins
    const PAGE = 1000;
    const allColabs: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await sb
        .from("colaboradores")
        .select("id, nome, matricula, status, cargos(nome), areas(nome), empresas(nome), localidades(nome)")
        .eq("status", "ativo")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allColabs.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    console.log(`Evaluating rule "${regra.nome}" against ${allColabs.length} active colaboradores`);

    // 5. Load existing atribuicoes to avoid duplicates
    const existingAtribuicoes = new Set<string>();
    from = 0;
    while (true) {
      const { data } = await sb
        .from("perfil_atribuicoes")
        .select("colaborador_id, perfil_id")
        .eq("ativo", true)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((a: any) => existingAtribuicoes.add(`${a.colaborador_id}|${a.perfil_id}`));
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // 6. Evaluate each colaborador against ALL conditions (AND logic)
    const actions: any[] = [];

    for (const colab of allColabs) {
      const allMatch = condicoes.every((cond: any) => evaluateCondition(cond, colab));
      if (!allMatch) continue;

      // This colaborador matches — generate actions from results
      for (const resultado of resultados) {
        if (resultado.tipo === "conceder_perfil" && resultado.perfil_id) {
          const key = `${colab.id}|${resultado.perfil_id}`;
          if (existingAtribuicoes.has(key)) continue; // Already has this profile

          actions.push({
            colaborador_id: colab.id,
            colaborador_nome: colab.nome,
            tipo: "conceder_perfil",
            perfil_id: resultado.perfil_id,
            perfil_nome: (resultado.perfis_acesso as any)?.nome || "—",
          });
        } else if (resultado.tipo === "revogar_perfil" && resultado.perfil_id) {
          const key = `${colab.id}|${resultado.perfil_id}`;
          if (!existingAtribuicoes.has(key)) continue; // Doesn't have this profile

          actions.push({
            colaborador_id: colab.id,
            colaborador_nome: colab.nome,
            tipo: "revogar_perfil",
            perfil_id: resultado.perfil_id,
            perfil_nome: (resultado.perfis_acesso as any)?.nome || "—",
          });
        }
      }
    }

    console.log(`Rule "${regra.nome}": ${actions.length} actions to ${shouldExecute ? "execute" : "simulate"}`);

    // 7. If execute=true, persist the actions
    let applied = 0;
    if (shouldExecute && actions.length > 0) {
      for (const action of actions) {
        if (action.tipo === "conceder_perfil") {
          const { error } = await sb.from("perfil_atribuicoes").insert({
            colaborador_id: action.colaborador_id,
            perfil_id: action.perfil_id,
            origem: "regra",
            ativo: true,
          });
          if (!error) applied++;
          else console.error("Insert atribuicao error:", error.message);
        } else if (action.tipo === "revogar_perfil") {
          const { error } = await sb.from("perfil_atribuicoes")
            .update({ ativo: false, data_revogacao: new Date().toISOString() })
            .eq("colaborador_id", action.colaborador_id)
            .eq("perfil_id", action.perfil_id)
            .eq("ativo", true);
          if (!error) applied++;
          else console.error("Revoke atribuicao error:", error.message);
        }
      }

      // Audit log
      await sb.from("auditoria").insert({
        entidade: "regra", acao: "executar",
        entidade_id: regraId,
        resumo: `Regra "${regra.nome}" executada manualmente: ${applied} atribuições`,
        detalhes: { regraId, regraNome: regra.nome, totalActions: actions.length, applied },
      });
    }

    return new Response(JSON.stringify({
      regra: regra.nome,
      executed: shouldExecute,
      total_colaboradores: allColabs.length,
      matching: actions.length,
      applied: shouldExecute ? applied : undefined,
      actions: actions.slice(0, 500), // Limit response size
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("execute-rules error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
