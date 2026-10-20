// Testa as conexões de sistemas marcadas como "pendente" (disparado pelo Hermes via /run_task).
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRoleOrService } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// deno-lint-ignore no-explicit-any
function authHeaders(c: any): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (c.auth_type === "bearer" && c.api_token) h.Authorization = `Bearer ${c.api_token}`;
  if (c.auth_type === "basic") h.Authorization = `Basic ${btoa(`${c.username || ""}:${c.password || ""}`)}`;
  if (c.auth_type === "api_key" && c.api_key_header && c.api_key_value) h[c.api_key_header] = c.api_key_value;
  if (c.auth_type === "app_token") { if (c.app_token) h["App-Token"] = c.app_token; if (c.session_token) h["Session-Token"] = c.session_token; }
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: apps, error } = await sb.from("aplicacoes").select("id, nome, modo_acesso, grupo_id, instrucoes_acesso")
    .eq("teste_status", "pendente").in("modo_acesso", ["grupo", "api", "manual"]).limit(50);
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
          else detalhe = `API respondeu (HTTP ${r.status})`;
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
