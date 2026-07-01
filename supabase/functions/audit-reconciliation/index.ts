// Auditoria por amostragem: valida contra Microsoft Graph que a última reconciliação
// enfileirou/pulou itens corretamente. NÃO altera itens — apenas gera relatório em `auditoria`
// e retorna contagens de acertos/erros.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SAMPLE = 50;

async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Azure auth failed (${res.status}): ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function graphGetUser(token: string, identifier: string): Promise<
  { found: false } | { found: true; accountEnabled: boolean; onPremisesSyncEnabled: boolean; id: string }
> {
  // Try by id first if looks like GUID
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const paths = isGuid
    ? [`/users/${identifier}?$select=id,accountEnabled,onPremisesSyncEnabled`]
    : [
        `/users/${encodeURIComponent(identifier)}?$select=id,accountEnabled,onPremisesSyncEnabled`,
        `/users?$filter=mail eq '${identifier.replace(/'/g, "''")}' or userPrincipalName eq '${identifier.replace(/'/g, "''")}'&$select=id,accountEnabled,onPremisesSyncEnabled&$top=1`,
      ];
  for (const p of paths) {
    const res = await fetch(`https://graph.microsoft.com/v1.0${p}`, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (res.status === 404) continue;
    if (!res.ok) continue;
    const body = await res.json();
    const u = body.value ? body.value[0] : body;
    if (u && u.id) {
      return {
        found: true,
        id: u.id,
        accountEnabled: !!u.accountEnabled,
        onPremisesSyncEnabled: !!u.onPremisesSyncEnabled,
      };
    }
  }
  return { found: false };
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const copy = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

async function runAudit(sb: any) {
  const token = await getGraphToken();

  // Amostras da fila
  const { data: disableEntra } = await sb.from("iam_queue")
    .select("id, colaborador_id, target_identity, payload_json")
    .eq("action_type", "disable_entra")
    .eq("requested_by", "reconciliacao")
    .in("status", ["pending", "waiting_approval"]);
  const { data: disableAd } = await sb.from("iam_queue")
    .select("id, colaborador_id, target_identity, payload_json")
    .eq("action_type", "disable")
    .eq("requested_by", "reconciliacao")
    .in("status", ["pending", "waiting_approval"]);

  const sDisableEntra = sample(disableEntra || [], SAMPLE);
  const sDisableAd = sample(disableAd || [], SAMPLE);

  // Amostra de "pulados": desligados com email mas sem item na fila (não geraram disable_entra)
  const { data: desligados } = await sb.from("colaboradores")
    .select("id, nome, email, entra_id, sam_account_name")
    .in("status", ["desligado", "inativo"])
    .not("email", "is", null)
    .limit(2000);
  const desligIds = new Set((disableEntra || []).map((q: any) => q.colaborador_id));
  const skipped = (desligados || []).filter((c: any) => !desligIds.has(c.id));
  const sSkipped = sample(skipped, SAMPLE);

  const result = {
    disable_entra: { total: (disableEntra || []).length, sampled: sDisableEntra.length, correct: 0, wrong: 0, wrong_items: [] as any[] },
    disable_ad: { total: (disableAd || []).length, sampled: sDisableAd.length, correct: 0, wrong: 0, wrong_items: [] as any[] },
    skipped: { total: skipped.length, sampled: sSkipped.length, correct: 0, wrong: 0, wrong_items: [] as any[] },
  };

  // Valida disable_entra: precisa existir no Entra E estar enabled
  for (const q of sDisableEntra) {
    const ident = q.target_identity || (q.payload_json as any)?.mail;
    if (!ident) continue;
    const r = await graphGetUser(token, ident);
    if (r.found && r.accountEnabled) result.disable_entra.correct++;
    else {
      result.disable_entra.wrong++;
      result.disable_entra.wrong_items.push({ id: q.id, ident, reason: !r.found ? "not_in_entra" : "already_disabled" });
    }
    await new Promise((r) => setTimeout(r, 30));
  }

  // Valida disable AD: on-prem OU não existe no Entra Cloud
  for (const q of sDisableAd) {
    const ident = q.target_identity || (q.payload_json as any)?.mail;
    if (!ident) continue;
    const r = await graphGetUser(token, ident);
    const ok = !r.found || (r.found && r.onPremisesSyncEnabled);
    if (ok) result.disable_ad.correct++;
    else {
      result.disable_ad.wrong++;
      result.disable_ad.wrong_items.push({ id: q.id, ident, reason: "cloud_only_should_be_entra" });
    }
    await new Promise((r) => setTimeout(r, 30));
  }

  // Valida pulados: NÃO devem existir no Entra
  for (const c of sSkipped) {
    const ident = c.entra_id || c.email;
    if (!ident) continue;
    const r = await graphGetUser(token, ident);
    if (!r.found) result.skipped.correct++;
    else {
      result.skipped.wrong++;
      result.skipped.wrong_items.push({ colab_id: c.id, ident, reason: "exists_in_entra_but_skipped" });
    }
    await new Promise((r) => setTimeout(r, 30));
  }

  await sb.from("auditoria").insert({
    entidade: "reconciliacao_identidades",
    acao: "auditar_amostragem",
    resumo: `Auditoria: disable_entra ${result.disable_entra.correct}/${result.disable_entra.sampled} · disable_ad ${result.disable_ad.correct}/${result.disable_ad.sampled} · pulados ${result.skipped.correct}/${result.skipped.sampled}`,
    detalhes: result,
  });

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const result = await runAudit(sb);
    return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("audit-reconciliation error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
