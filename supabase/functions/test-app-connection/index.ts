// Testa as conexões de sistemas marcadas como "pendente" (disparado pelo Hermes via /run_task).
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRoleOrService } from "../_shared/auth.ts";
import { authHeaders, runAppAction } from "../_shared/appApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // modo "todos" (agenda diária do Hermes): retesta todos os sistemas já ativados; padrão: só os pendentes.
  // aplicacao_id + email_teste: só consulta o usuário de teste no sistema (nada é criado).
  const body = await req.json().catch(() => ({})) as { modo?: string; aplicacao_id?: string; email_teste?: string };
  if (body.aplicacao_id && body.email_teste) {
    const { data: c } = await sb.from("aplicacao_connectors").select("config").eq("aplicacao_id", body.aplicacao_id).maybeSingle();
    try {
      const r = await runAppAction(c?.config, "lookup", { email: body.email_teste, login: body.email_teste.split("@")[0] }, true);
      return new Response(JSON.stringify({ success: r.status === "success", ...r }), { headers: corsHeaders });
    } catch (e) { return new Response(JSON.stringify({ success: false, result_message: `Falha ao consultar: ${(e as Error).message}` }), { headers: corsHeaders }); }
  }
  let q = sb.from("aplicacoes").select("id, nome, modo_acesso, grupo_id, instrucoes_acesso").in("modo_acesso", ["grupo", "api", "manual"]).limit(200);
  q = body.modo === "todos" ? q.in("teste_status", ["ok", "erro", "pendente"]) : q.eq("teste_status", "pendente");
  const { data: apps, error } = await q;
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });

  const out: { app: string; status: string; detalhe: string }[] = [];
  for (const a of apps ?? []) {
    let status = "ok"; let detalhe = "";
    try {
      if (a.modo_acesso === "grupo") {
        const { data: g } = a.grupo_id ? await sb.from("entra_grupos").select("nome, entra_id").eq("id", a.grupo_id).maybeSingle() : { data: null };
        if (!g?.entra_id) { status = "erro"; detalhe = "Grupo não encontrado no catálogo do AD/Entra"; } else detalhe = `Grupo ${g.nome} encontrado`;
      } else if (a.modo_acesso === "manual") {
        if (!a.instrucoes_acesso?.trim()) { status = "erro"; detalhe = "Faltam as instruções de como dar acesso"; } else detalhe = "Instruções cadastradas; o dono recebe uma tarefa a cada pedido";
      } else {
        const { data: c } = await sb.from("aplicacao_connectors").select("config").eq("aplicacao_id", a.id).maybeSingle();
        // deno-lint-ignore no-explicit-any
        const cfg: any = c?.config ?? {};
        if (!cfg.base_url) { status = "erro"; detalhe = "Falta o endereço da API"; }
        else {
          const r = await fetch(cfg.base_url, { headers: authHeaders(cfg), signal: AbortSignal.timeout(15000) });
          await r.body?.cancel();
          if (r.status === 401 || r.status === 403) { status = "erro"; detalhe = `A API recusou a credencial (HTTP ${r.status})`; }
          else if (r.status >= 500) { status = "erro"; detalhe = `A API respondeu com erro (HTTP ${r.status})`; }
          else if (!cfg.actions?.create?.path || !cfg.actions?.disable?.path) { status = "erro"; detalhe = "A API responde, mas falta dizer como criar e desativar o usuário"; }
          else detalhe = `API respondeu (HTTP ${r.status}); criação e desativação configuradas`;
        }
      }
    } catch (e) { status = "erro"; detalhe = `Falha ao testar: ${(e as Error).message}`; }
    await sb.from("aplicacoes").update({ teste_status: status, teste_em: new Date().toISOString(), teste_detalhe: detalhe, integracao_ativa: status === "ok" }).eq("id", a.id);
    if (status === "erro") {
      await sb.from("alertas").insert({ tipo: "app_connection_failed", severidade: "aviso", titulo: `Conexão com ${a.nome} falhou`, mensagem: detalhe, ref_tipo: "aplicacao", ref_id: a.id, ref_url: `/aplicacoes/${a.id}/conectar` });
    }
    out.push({ app: a.nome, status, detalhe });
  }
  return new Response(JSON.stringify({ success: true, testadas: out.length, resultados: out }), { headers: corsHeaders });
});
