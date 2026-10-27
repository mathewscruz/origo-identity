// Contas de serviço: confere no Entra se cada conta existe/está ativa e último login,
// marca dono desligado como "sem dono" (nunca desativa a conta) e gera alertas
// (revalidação vencida, sem dono, divergência). Disparada só pelo Hermes.
import { corsHeaders } from "../_shared/cors.ts";
import { requireRoleOrService, serviceClient } from "../_shared/auth.ts";
import { GRAPH, getGraphToken, graphHeaders } from "../_shared/graph.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function lookup(token: string, email: string | null, sam: string | null) {
  const sel = "id,accountEnabled,userPrincipalName,signInActivity";
  const tries: string[] = [];
  if (email) tries.push(`${GRAPH}/users/${encodeURIComponent(email)}?$select=${sel}`);
  if (sam) tries.push(`${GRAPH}/users?$filter=onPremisesSamAccountName eq '${sam.replace(/'/g, "''")}'&$select=${sel}`);
  for (const url of tries) {
    let r = await fetch(url, { headers: graphHeaders(token) });
    if (r.status === 403) r = await fetch(url.replace(",signInActivity", ""), { headers: graphHeaders(token) });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`Graph ${r.status}`);
    const d = await r.json();
    const u = Array.isArray(d.value) ? d.value[0] : d;
    if (u?.id) return u;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin", "operador", "platform_admin"]);
  if (auth instanceof Response) return auth;
  const sb = serviceClient();
  try {
    const { data: contas, error } = await sb.from("contas_servico").select("id, nome, email, sam_account_name, ativo, dono_colaborador_id, ultima_revalidacao, created_at");
    if (error) throw error;
    const { data: par } = await sb.from("parametros").select("valor").eq("chave", "conta_servico_revalidacao_dias").maybeSingle();
    const dias = Number(par?.valor) || 90;
    const donoIds = [...new Set((contas ?? []).map((c) => c.dono_colaborador_id).filter(Boolean))];
    const { data: donos } = donoIds.length ? await sb.from("colaboradores").select("id, nome, status").in("id", donoIds) : { data: [] };
    const donoMap = new Map((donos ?? []).map((d) => [d.id, d]));
    const token = await getGraphToken();
    const res = { total: contas?.length ?? 0, verificadas: 0, nao_encontradas: 0, divergentes: 0, sem_dono: 0, vencidas: 0, dono_desligado: 0 };
    const alertas: Record<string, unknown>[] = [];
    const hoje = Date.now();
    for (const c of contas ?? []) {
      const upd: Record<string, unknown> = { verificado_em: new Date().toISOString() };
      try {
        const u = await lookup(token, c.email, c.sam_account_name);
        if (!u) { res.nao_encontradas++; upd.entra_ativo = null; upd.verificacao_detalhe = "Não encontrada no Entra"; }
        else {
          res.verificadas++;
          upd.entra_id = u.id; upd.entra_ativo = !!u.accountEnabled; upd.verificacao_detalhe = null;
          upd.ultimo_login = u.signInActivity?.lastSignInDateTime ?? null;
          if (!!u.accountEnabled !== c.ativo) {
            res.divergentes++;
            alertas.push({ tipo: "conta_servico_divergente", severidade: "aviso", titulo: `Conta de serviço divergente: ${c.nome}`,
              mensagem: `No painel está ${c.ativo ? "ativa" : "desativada"}, no Entra está ${u.accountEnabled ? "ativa" : "desabilitada"}.`, ref_tipo: "conta_servico", ref_id: c.id, ref_url: `/contas-servico/${c.id}` });
          }
        }
      } catch (e) { upd.verificacao_detalhe = `Erro na consulta: ${(e as Error).message}`; }
      const dono = c.dono_colaborador_id ? donoMap.get(c.dono_colaborador_id) : null;
      if (dono && dono.status === "desligado") {
        res.dono_desligado++; upd.dono_colaborador_id = null;
        alertas.push({ tipo: "conta_servico_sem_dono", severidade: "aviso", titulo: `Dono desligado: ${c.nome}`,
          mensagem: `${dono.nome} foi desligado; a conta de serviço ${c.nome} ficou sem dono e continua ativa. Defina um novo dono.`, ref_tipo: "conta_servico", ref_id: c.id, ref_url: `/contas-servico/${c.id}` });
      } else if (c.ativo && !c.dono_colaborador_id) res.sem_dono++;
      const base = new Date(c.ultima_revalidacao ?? c.created_at).getTime();
      if (c.ativo && hoje - base > dias * 86400000) res.vencidas++;
      await sb.from("contas_servico").update(upd).eq("id", c.id);
    }
    if (res.sem_dono || res.vencidas) {
      alertas.push({ tipo: "conta_servico_pendencias", severidade: "aviso", titulo: "Contas de serviço pendentes",
        mensagem: `${res.sem_dono} sem dono · ${res.vencidas} com revalidação vencida (${dias} dias).`, ref_tipo: "conta_servico", ref_url: "/contas-servico" });
    }
    // um alerta por tipo/conta por dia
    const desde = new Date(hoje - 86400000).toISOString();
    const { data: recentes } = await sb.from("alertas").select("tipo, ref_id").like("tipo", "conta_servico_%").gte("created_at", desde);
    const vistos = new Set((recentes ?? []).map((a) => `${a.tipo}:${a.ref_id ?? ""}`));
    const novos = alertas.filter((a) => !vistos.has(`${a.tipo}:${a.ref_id ?? ""}`));
    if (novos.length) await sb.from("alertas").insert(novos);
    return json({ ok: true, ...res, alertas: novos.length });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
