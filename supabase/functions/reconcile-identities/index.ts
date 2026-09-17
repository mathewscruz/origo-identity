// Reconciliação de identidades contra o Entra ID (etapa 2 do ciclo diário) — a única.
//   1. vincula colaboradores ao Entra por matching ESTRITO (entra_id, e-mail/UPN, SAM, matrícula)
//      — ambiguidade vira alerta, nunca escolhe um candidato
//   2. resolve eventos joiner pendentes quando a conta já existe; cancela criações de conta
//      abertas (create/create_if_not_exists) de quem já existe no Entra ou está desligado
//   3. desligados/inativos ainda habilitados no Entra → disable_entra (+ disable AD se on-prem),
//      revoga perfis e enfileira remoções pelo acesso efetivo (RPCs); registra evento leaver
//   4. ativos sem conta → create_if_not_exists; ativos com conta desabilitada → enable_entra
//      (sempre com aprovação)
//   5. contas do Entra sem correspondência na base → review_orphan_entra (aguardando revisão)
//   Nunca apaga colaboradores ("fantasmas" ficam como desligados, com histórico).
//   Só lê o Entra: toda escrita em diretório é feita pelo Órigo Agente via fila.
// Roda em background (EdgeRuntime.waitUntil) e reporta em sync_jobs (tipo='reconcile_identities').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRoleOrService } from "../_shared/auth.ts";
import { getGraphToken, fetchAllGraphUsers, buildEntraIndex, matchEntraUser, normalizeIdentifier, type GraphUser } from "../_shared/graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type Sb = ReturnType<typeof createClient>;
interface Colab { id: string; nome: string; email: string | null; matricula: string | null; status: string; entra_id: string | null; sam_account_name: string | null; origem: string | null; suspenso_preventivo: boolean | null }

function chunk<T>(arr: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

async function fetchAllColabs(sb: Sb): Promise<Colab[]> {
  const out: Colab[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from("colaboradores").select("id, nome, email, matricula, status, entra_id, sam_account_name, origem, suspenso_preventivo").order("id").range(offset, offset + 999);
    if (error) throw new Error(`Falha ao carregar colaboradores: ${error.message}`);
    out.push(...((data || []) as Colab[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function insertQueue(sb: Sb, row: Record<string, unknown>, stats: Record<string, number>, key: string) {
  const { error } = await sb.from("iam_queue").insert(row);
  if (!error) { stats[key] = (stats[key] || 0) + 1; return; }
  if (/duplicate key|ux_iam_queue_open_resource/i.test(error.message)) { stats.skipped_open = (stats.skipped_open || 0) + 1; return; }
  console.warn(`[reconcile] insert ${row.action_type}: ${error.message}`);
  stats.errors = (stats.errors || 0) + 1;
}

async function runReconciliation(sb: Sb, jobId: string, operador: string) {
  const stats: Record<string, number> = {};
  const update = (patch: Record<string, unknown>) => sb.from("sync_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  try {
    await update({ phase: "carregando_colabs", message: "Carregando colaboradores…", users_percent: 5 });
    const colabs = await fetchAllColabs(sb);
    stats.total_colabs = colabs.length;

    await update({ phase: "baixando_entra", message: "Baixando usuários do Entra ID…", users_percent: 15 });
    const token = await getGraphToken();
    const entraUsers = await fetchAllGraphUsers(token, async (n) => { await update({ message: `${n.toLocaleString("pt-BR")} usuários do Entra baixados…`, users_percent: 25 }); });
    const idx = buildEntraIndex(entraUsers);
    stats.entra_users = entraUsers.length;

    // ── 1. vínculo ──
    await update({ phase: "vinculando", message: "Vinculando colaboradores ao Entra ID…", users_percent: 40 });
    const matchOf = new Map<string, GraphUser>();
    const linkUpdates: { id: string; entra_id: string }[] = [];
    const usedEntraIds = new Set(colabs.map((c) => c.entra_id).filter(Boolean) as string[]);
    for (const c of colabs) {
      const m = matchEntraUser(c, idx);
      if (m.status === "found") {
        matchOf.set(c.id, m.user);
        if (!c.entra_id) {
          if (usedEntraIds.has(m.user.id)) { stats.duplicates = (stats.duplicates || 0) + 1; continue; } // conta já vinculada a outro colaborador
          usedEntraIds.add(m.user.id);
          linkUpdates.push({ id: c.id, entra_id: m.user.id });
        }
      } else if (m.status === "ambiguous") {
        stats.ambiguous = (stats.ambiguous || 0) + 1;
        const { count } = await sb.from("alertas").select("id", { count: "exact", head: true }).eq("tipo", "identidade_ambigua").eq("ref_id", c.id).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
        if (!count) {
          await sb.from("alertas").insert({ titulo: "Identidade ambígua no Entra ID", severidade: "aviso", tipo: "identidade_ambigua", ref_tipo: "colaborador", ref_id: c.id, ref_url: `/colaboradores/${c.id}`,
            mensagem: `${c.nome}: ${m.matchedBy} corresponde a ${m.candidates.length} contas (${m.candidates.map((u) => u.userPrincipalName).join(", ")}). Vincule o entra_id manualmente.` });
        }
      }
    }
    for (const batch of chunk(linkUpdates, 1000)) {
      const { error } = await sb.rpc("apply_reconcile_updates", { queue_updates: [], colab_updates: batch });
      if (error) console.warn(`[reconcile] apply_reconcile_updates: ${error.message}`);
    }
    stats.linked = linkUpdates.length;

    // ── 2. joiners pendentes (legado) + criações de conta abertas que não fazem mais sentido ──
    await update({ phase: "resolvendo_joiners", message: "Resolvendo joiners pendentes…", users_percent: 55 });
    const linkedIds = colabs.filter((c) => c.entra_id || matchOf.has(c.id)).map((c) => c.id);
    for (const batch of chunk(linkedIds, 500)) {
      const { count } = await sb.from("eventos_jml").update({ status: "executado", erro_mensagem: "Reconciliado: conta existente no Entra ID" }, { count: "exact" })
        .in("colaborador_id", batch).eq("tipo", "joiner").in("status", ["pendente", "executando"]);
      stats.joiners_resolved = (stats.joiners_resolved || 0) + (count || 0);
    }
    {
      const colabById = new Map(colabs.map((c) => [c.id, c]));
      const colabByKey = new Map<string, Colab>();
      for (const c of colabs) for (const k of [normalizeIdentifier(c.email), normalizeIdentifier(c.sam_account_name), normalizeIdentifier(c.matricula)]) if (k && !colabByKey.has(k)) colabByKey.set(k, c);
      const { data: openCreates } = await sb.from("iam_queue").select("id, colaborador_id, target_identity, payload_json")
        .in("action_type", ["create", "create_if_not_exists"]).in("status", ["waiting_approval", "pending"]);
      const cancelExists: string[] = []; const cancelDesligado: string[] = []; const backfill: { id: string; colaborador_id: string }[] = [];
      for (const item of openCreates || []) {
        const p = (item.payload_json || {}) as Record<string, unknown>;
        let colab = item.colaborador_id ? colabById.get(item.colaborador_id) : undefined;
        if (!colab) {
          for (const k of [p.mail, p.email, p.userPrincipalName, p.samAccountName, p.sAMAccountName, item.target_identity, p.employeeId, p.employeeID].map((x) => normalizeIdentifier(x as string | null))) {
            if (k && colabByKey.has(k)) { colab = colabByKey.get(k); break; }
          }
          if (colab) backfill.push({ id: item.id, colaborador_id: colab.id });
        }
        if (colab && (colab.status === "desligado" || colab.status === "inativo")) { cancelDesligado.push(item.id); continue; }
        const found = colab ? (matchOf.get(colab.id) || (colab.entra_id ? idx.byId.get(colab.entra_id) : undefined)) : undefined;
        const direct = found ? null : matchEntraUser({ email: (p.mail || p.email || p.userPrincipalName) as string | null, sam_account_name: (p.samAccountName || p.sAMAccountName || item.target_identity) as string | null, matricula: (p.employeeId || p.employeeID) as string | null, entra_id: null }, idx);
        const user = found || (direct && direct.status === "found" ? direct.user : null);
        if (user) {
          cancelExists.push(item.id);
          if (colab && colab.entra_id !== user.id && !linkUpdates.some((u) => u.id === colab!.id)) {
            await sb.rpc("apply_reconcile_updates", { queue_updates: [], colab_updates: [{ id: colab.id, entra_id: user.id }] });
            stats.linked = (stats.linked || 0) + 1;
          }
        }
      }
      for (const batch of chunk(backfill, 1000)) await sb.rpc("apply_reconcile_updates", { queue_updates: batch, colab_updates: [] });
      for (const batch of chunk(cancelExists, 500)) {
        await sb.from("iam_queue").update({ status: "cancelled", processed_by: "reconciliacao", processed_at: new Date().toISOString(), result_message: "Usuário já existe no Entra ID — criação cancelada pela reconciliação.", error_code: null }).in("id", batch);
      }
      for (const batch of chunk(cancelDesligado, 500)) {
        await sb.from("iam_queue").update({ status: "cancelled", processed_by: "reconciliacao", processed_at: new Date().toISOString(), result_message: "Colaborador desligado/inativo — criação de conta cancelada pela reconciliação.", error_code: null }).in("id", batch);
      }
      stats.creates_cancelled_existing = cancelExists.length;
      stats.creates_cancelled_desligado = cancelDesligado.length;
    }

    // ── 3. desligados/inativos ──
    const desligados = colabs.filter((c) => c.status === "desligado" || c.status === "inativo");
    await update({ phase: "enfileirando_disable", message: `Conferindo ${desligados.length} desligado(s)/inativo(s) contra o Entra…`, users_percent: 65 });
    const existingLeaver = new Set<string>();
    for (const batch of chunk(desligados.map((c) => c.id), 500)) {
      const { data } = await sb.from("eventos_jml").select("colaborador_id").in("colaborador_id", batch).eq("tipo", "leaver");
      for (const e of data || []) existingLeaver.add(e.colaborador_id);
    }
    const activeAtrib = new Map<string, number>();
    for (const batch of chunk(desligados.map((c) => c.id), 500)) {
      const { data } = await sb.from("perfil_atribuicoes").select("colaborador_id").in("colaborador_id", batch).eq("ativo", true);
      for (const a of data || []) activeAtrib.set(a.colaborador_id, (activeAtrib.get(a.colaborador_id) || 0) + 1);
    }
    for (const c of desligados) {
      const u = matchOf.get(c.id) || (c.entra_id ? idx.byId.get(c.entra_id) : undefined);
      const target = c.email || c.sam_account_name || u?.userPrincipalName || null;
      if (u && u.accountEnabled !== false && target) {
        await insertQueue(sb, {
          action_type: "disable_entra", status: "pending", colaborador_id: c.id, target_identity: target, requested_by: "reconciliacao",
          resource_key: `entra_account:${target}`,
          payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || u.mail || "", entra_id: u.id, revokeSignInSessions: true, reason: "leaver_reconciliacao" },
        }, stats, "disable_entra_enqueued");
        if (c.sam_account_name && u.onPremisesSyncEnabled === true) {
          await insertQueue(sb, {
            action_type: "disable", status: "pending", colaborador_id: c.id, target_identity: c.sam_account_name, requested_by: "reconciliacao",
            resource_key: `ad_account:${c.sam_account_name}`,
            payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "", status: "disabled", status_anterior: "ativo", status_novo: c.status, changed_fields: ["status"], new_values: { status: "disabled" }, reason: "leaver_reconciliacao" },
          }, stats, "disable_ad_enqueued");
        }
      } else if (!u) stats.desligados_sem_entra = (stats.desligados_sem_entra || 0) + 1;
      else stats.desligados_ja_desabilitados = (stats.desligados_ja_desabilitados || 0) + 1;

      // acessos ainda ativos no modelo → revoga e enfileira remoções pelo acesso efetivo
      if ((activeAtrib.get(c.id) || 0) > 0) {
        const { data: perfis } = await sb.rpc("iam_active_perfil_ids", { p_colaborador_id: c.id, p_terceiro_id: null, p_exclude: [] });
        await sb.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() }).eq("colaborador_id", c.id).eq("ativo", true);
        const { data: n } = await sb.rpc("iam_enqueue_profile_actions", { p_colaborador_id: c.id, p_terceiro_id: null, p_perfil_ids: perfis || [], p_mode: "remove", p_requested_by: "reconciliacao", p_status: "pending", p_motivo: "leaver_reconciliacao" });
        stats.remove_enqueued = (stats.remove_enqueued || 0) + (Number(n) || 0);
        stats.perfis_revogados = (stats.perfis_revogados || 0) + (perfis?.length || 0);
      }
      if (u || (activeAtrib.get(c.id) || 0) > 0) {
        const { data: ind } = await sb.rpc("iam_enqueue_individual_removals", { p_colaborador_id: c.id, p_terceiro_id: null, p_requested_by: "reconciliacao", p_status: "pending" });
        stats.remove_enqueued = (stats.remove_enqueued || 0) + (Number(ind?.enfileirados) || 0);
      }
      if (!existingLeaver.has(c.id)) {
        await sb.from("eventos_jml").insert({ tipo: "leaver", status: "executado", colaborador_id: c.id, colaborador_nome: c.nome, origem: "reconciliacao",
          dados_antes: { matricula: c.matricula, nome: c.nome, tipo_desativacao: "hard", entra_account_enabled: u?.accountEnabled ?? null },
          dados_depois: { status: c.status, reconciliado_em: new Date().toISOString() } });
        stats.leaver_events = (stats.leaver_events || 0) + 1;
      }
    }

    // ── 4. ativos: sem conta → create; conta desabilitada → enable (com aprovação) ──
    await update({ phase: "cobertura", message: "Analisando ativos sem conta / desabilitados…", users_percent: 85 });
    for (const c of colabs.filter((x) => x.status === "ativo")) {
      const u = matchOf.get(c.id) || (c.entra_id ? idx.byId.get(c.entra_id) : undefined);
      if (!u) {
        if (!c.email && !c.sam_account_name) { stats.ativos_sem_identidade = (stats.ativos_sem_identidade || 0) + 1; continue; }
        const [first, ...rest] = (c.nome || "").trim().split(/\s+/);
        const sam = c.sam_account_name || (c.email ? c.email.split("@")[0] : null);
        await insertQueue(sb, {
          action_type: "create_if_not_exists", status: "pending", colaborador_id: c.id, target_identity: sam || c.email, requested_by: "reconciliacao",
          resource_key: `ad_account:${sam || c.email}`,
          payload_json: { displayName: c.nome, givenName: first || c.nome, surname: rest.join(" ") || "", mail: c.email, userPrincipalName: c.email, samAccountName: sam, usageLocation: "BR", reason: "ativo_sem_conta" },
        }, stats, "create_enqueued");
      } else if (u.accountEnabled === false && !c.suspenso_preventivo) {
        const target = c.email || c.sam_account_name || u.userPrincipalName;
        await insertQueue(sb, {
          action_type: "enable_entra", status: "waiting_approval", colaborador_id: c.id, target_identity: target, requested_by: "reconciliacao",
          resource_key: `entra_account:${target}`,
          payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || u.mail || "", entra_id: u.id, reason: "ativo_com_conta_desabilitada" },
        }, stats, "enable_enqueued");
      }
    }

    // ── 5. contas órfãs no Entra (existem lá, não casam com ninguém na base) ──
    await update({ phase: "orfaos", message: "Detectando contas órfãs no Entra…", users_percent: 92 });
    {
      const { data: prefParam } = await sb.from("parametros").select("valor").eq("chave", "iam_orphan_ignore_prefixes").maybeSingle();
      const ignorePrefixes = String(prefParam?.valor || "svc.,admin.,test.,sa.,adm.,notif.,noreply,sync.").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const { data: adminKnown } = await sb.from("contas_admin_conhecidas").select("email, entra_id");
      const knownIds = new Set((adminKnown || []).map((r: { entra_id: string | null }) => r.entra_id).filter(Boolean));
      const knownEmails = new Set((adminKnown || []).map((r: { email: string | null }) => normalizeIdentifier(r.email)).filter(Boolean));
      const linkedEntra = new Set<string>();
      for (const c of colabs) { if (c.entra_id) linkedEntra.add(c.entra_id); const m = matchOf.get(c.id); if (m) linkedEntra.add(m.id); }
      for (const u of linkUpdates) linkedEntra.add(u.entra_id);
      const { data: tercs } = await sb.from("terceiros").select("email");
      const tercEmails = new Set((tercs || []).map((t: { email: string | null }) => normalizeIdentifier(t.email)).filter(Boolean));
      const orphanRows: Record<string, unknown>[] = [];
      for (const u of entraUsers) {
        if (linkedEntra.has(u.id) || knownIds.has(u.id)) continue;
        const upn = String(u.userPrincipalName || "").toLowerCase();
        if (upn.includes("#ext#")) continue;
        const prefix = upn.split("@")[0] || "";
        if (ignorePrefixes.some((p) => prefix.startsWith(p))) continue;
        if (knownEmails.has(normalizeIdentifier(u.mail)) || knownEmails.has(normalizeIdentifier(upn))) continue;
        if (tercEmails.has(normalizeIdentifier(u.mail)) || tercEmails.has(normalizeIdentifier(upn))) continue;
        orphanRows.push({
          action_type: "review_orphan_entra", status: "waiting_approval", colaborador_id: null,
          target_identity: u.mail || u.userPrincipalName, requested_by: "reconciliacao", resource_key: `orphan:${u.id}`,
          payload_json: { reason: "orphan_entra", entra_id: u.id, displayName: u.displayName, mail: u.mail, userPrincipalName: u.userPrincipalName, accountEnabled: u.accountEnabled, createdDateTime: u.createdDateTime },
        });
      }
      // itens sem identidade não são cobertos pelo índice único: dedupe por resource_key contra abertos e já decididos (rejeitado = conta legítima)
      const openKeys = new Set<string>();
      const keys = orphanRows.map((r) => r.resource_key as string);
      for (const batch of chunk(keys, 500)) {
        const { data } = await sb.from("iam_queue").select("resource_key").eq("action_type", "review_orphan_entra").in("status", ["pending", "waiting_approval", "processing", "success"]).in("resource_key", batch);
        for (const r of data || []) openKeys.add(r.resource_key);
      }
      let inserted = 0;
      for (const row of orphanRows) {
        if (openKeys.has(row.resource_key as string)) continue;
        const { error } = await sb.from("iam_queue").insert(row);
        if (!error) inserted++;
      }
      stats.orphans_total = orphanRows.length;
      stats.orphans_new = inserted;
    }

    const msg = `Reconciliação: ${stats.linked || 0} vinculados · ${stats.ambiguous || 0} ambíguos · ${stats.duplicates || 0} contas já usadas · ${stats.joiners_resolved || 0} joiners resolvidos · ${stats.disable_entra_enqueued || 0} disable_entra · ${stats.disable_ad_enqueued || 0} disable AD · ${stats.remove_enqueued || 0} remoções · ${stats.leaver_events || 0} eventos leaver · ${stats.create_enqueued || 0} criações · ${stats.enable_enqueued || 0} reabilitações (aprovação) · ${stats.creates_cancelled_existing || 0}+${stats.creates_cancelled_desligado || 0} criações canceladas · ${stats.orphans_new || 0} órfãos novos (${stats.orphans_total || 0} no total).`;
    await update({ status: "done", phase: "done", users_percent: 100, message: msg });
    await sb.from("auditoria").insert({ entidade: "reconciliacao", acao: "executar", operador, resumo: msg, detalhes: { job_id: jobId, ...stats } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reconcile-identities] failed:", msg);
    await update({ status: "error", phase: "erro", error: msg, message: `Falha na reconciliação: ${msg}` });
  } finally {
    await sb.from("sync_jobs").update({ status: "error", phase: "erro", error: "Execução interrompida inesperadamente.", updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "running");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const stale = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await sb.from("sync_jobs").update({ status: "error", phase: "timeout", error: "Reconciliação sem atualização recente.", updated_at: new Date().toISOString() }).eq("tipo", "reconcile_identities").eq("status", "running").lt("updated_at", stale);
    const { data: existing } = await sb.from("sync_jobs").select("id, status, phase, message, users_percent, updated_at").eq("tipo", "reconcile_identities").eq("status", "running").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return new Response(JSON.stringify({ success: true, already_running: true, job: existing }), { status: 202, headers: corsHeaders });

    const { data: job, error: jobErr } = await sb.from("sync_jobs").insert({ tipo: "reconcile_identities", status: "running", phase: "iniciando", message: "Iniciando reconciliação…", users_percent: 0 }).select("id").single();
    if (jobErr || !job) return new Response(JSON.stringify({ error: `Falha ao criar job: ${jobErr?.message}` }), { status: 500, headers: corsHeaders });

    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(runReconciliation(sb, job.id, auth.email));
    else runReconciliation(sb, job.id, auth.email);
    return new Response(JSON.stringify({ success: true, started: true, job_id: job.id }), { status: 202, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
