// Reconciliação de identidades: linka colaboradores existentes ao Entra ID via Graph,
// gera eventos leaver para desligados sem evento, e marca joiners pendentes como executados
// quando o colaborador já existe no Entra ID.
// Roda em background via EdgeRuntime.waitUntil e reporta progresso em sync_jobs (tipo='reconcile_identities').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

interface Colab {
  id: string;
  nome: string;
  email: string | null;
  matricula: string | null;
  status: string;
  entra_id: string | null;
  sam_account_name: string | null;
  origem: string | null;
}

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllColabs(sb: any): Promise<Colab[]> {
  const PAGE = 1000;
  let offset = 0;
  const out: Colab[] = [];
  while (true) {
    const { data, error } = await sb
      .from("colaboradores")
      .select("id, nome, email, matricula, status, entra_id, sam_account_name, origem")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Falha ao carregar colaboradores: ${error.message}`);
    const rows = (data || []) as Colab[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function lookupEntraByEmails(
  token: string,
  emails: string[],
): Promise<Map<string, { id: string; upn: string }>> {
  const result = new Map<string, { id: string; upn: string }>();
  const batches = chunk(emails, 20);
  for (const batch of batches) {
    const reqs = batch.map((email, idx) => ({
      id: String(idx),
      method: "GET",
      url: `/users?$filter=mail eq '${email.replace(/'/g, "''")}' or userPrincipalName eq '${email.replace(/'/g, "''")}'&$select=id,mail,userPrincipalName&$top=1`,
    }));
    const res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: reqs }),
    });
    if (!res.ok) {
      console.error("Graph batch error:", res.status, await res.text());
      continue;
    }
    const body = await res.json();
    for (const r of body.responses || []) {
      const idx = Number(r.id);
      const original = batch[idx];
      const users = r.body?.value || [];
      if (users.length > 0) {
        result.set(original.toLowerCase(), {
          id: users[0].id,
          upn: users[0].userPrincipalName || users[0].mail || original,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return result;
}

interface EntraUser {
  id: string;
  upn: string | null;
  mail: string | null;
  accountEnabled: boolean;
  onPremisesSyncEnabled: boolean;
}

async function fetchAllEntraUsers(token: string): Promise<{
  byId: Map<string, EntraUser>;
  byEmail: Map<string, EntraUser>;
}> {
  const byId = new Map<string, EntraUser>();
  const byEmail = new Map<string, EntraUser>();
  let url: string | null =
    "https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,mail,accountEnabled,onPremisesSyncEnabled&$top=999";
  const headers = { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" };
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Graph /users failed (${res.status}): ${await res.text()}`);
    const body = await res.json();
    for (const u of body.value || []) {
      const eu: EntraUser = {
        id: u.id,
        upn: u.userPrincipalName || null,
        mail: u.mail || null,
        accountEnabled: !!u.accountEnabled,
        onPremisesSyncEnabled: !!u.onPremisesSyncEnabled,
      };
      byId.set(eu.id, eu);
      if (eu.upn) byEmail.set(eu.upn.toLowerCase(), eu);
      if (eu.mail) byEmail.set(eu.mail.toLowerCase(), eu);
    }
    url = body["@odata.nextLink"] || null;
  }
  return { byId, byEmail };
}

function resolveEntraMatch(
  c: Colab,
  entraIdx: { byId: Map<string, EntraUser>; byEmail: Map<string, EntraUser> },
): EntraUser | null {
  return (
    (c.entra_id && entraIdx.byId.get(c.entra_id)) ||
    (c.email && entraIdx.byEmail.get(c.email.toLowerCase())) ||
    null
  );
}

async function updateJob(sb: any, jobId: string, patch: Record<string, unknown>) {
  await sb.from("sync_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
}

async function cleanupPhantomLeavers(
  sb: any,
  phantoms: Colab[],
  stats: any,
) {
  if (phantoms.length === 0) return;
  const ids = phantoms.map((c) => c.id);
  const now = new Date().toISOString();

  for (const batch of chunk(ids, 200)) {
    const { count, error } = await sb
      .from("iam_queue")
      .update({
        status: "cancelled",
        processed_at: now,
        processed_by: "reconcile-identities",
        result_message: "Usuário não encontrado no AD/Entra ID — removido/ignorado pela reconciliação.",
        error_code: null,
      }, { count: "exact" })
      .in("colaborador_id", batch)
      .in("status", ["pending", "waiting_approval", "processing"]);
    if (error) stats.errors.push(`cancel phantom queue: ${error.message}`);
    else stats.phantom_queue_cancelled += count || 0;
  }

  for (const batch of chunk(ids, 200)) {
    await sb.from("perfil_atribuicoes").delete().in("colaborador_id", batch);
    await sb.from("colab_quarentena").delete().in("colaborador_id", batch);
    await sb.from("excecoes").delete().in("colaborador_id", batch);
    await sb.from("revisao_itens").delete().in("colaborador_id", batch);
    const { count, error } = await sb
      .from("colaboradores")
      .delete({ count: "exact" })
      .in("id", batch);
    if (error) stats.errors.push(`delete phantom colabs: ${error.message}`);
    else stats.phantom_colabs_removed += count || 0;
  }
}

/**
 * For each leaver colab: deactivate perfil_atribuicoes, enqueue remove_group/license/app
 * for both profile-driven resources and individually-assigned ones (entra_sync/manual_individual).
 * Mirrors the client-side logic in src/lib/colaboradorLifecycle.ts so the automated
 * reconciliation path revokes access too, not just disables the account.
 */
async function revokeLeaverAccess(
  sb: any,
  leavers: Colab[],
  stats: any,
  requestedBy: string,
) {
  if (leavers.length === 0) return;
  const leaverIds = leavers.map((c) => c.id);
  const colabById = new Map(leavers.map((c) => [c.id, c]));

  // 1. Load active perfil_atribuicoes for all leavers at once
  const atribByColab = new Map<string, string[]>(); // colab_id -> perfil_ids
  const allPerfilIds = new Set<string>();
  for (const batch of chunk(leaverIds, 500)) {
    const { data } = await sb
      .from("perfil_atribuicoes")
      .select("colaborador_id, perfil_id")
      .in("colaborador_id", batch)
      .eq("ativo", true);
    for (const r of data || []) {
      if (!atribByColab.has(r.colaborador_id)) atribByColab.set(r.colaborador_id, []);
      atribByColab.get(r.colaborador_id)!.push(r.perfil_id);
      allPerfilIds.add(r.perfil_id);
    }
  }

  // 2. Deactivate them
  const colabsWithPerfis = Array.from(atribByColab.keys());
  if (colabsWithPerfis.length > 0) {
    for (const batch of chunk(colabsWithPerfis, 500)) {
      const { error } = await sb
        .from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() })
        .in("colaborador_id", batch)
        .eq("ativo", true);
      if (error) stats.errors.push(`deactivate perfis: ${error.message}`);
      else stats.perfis_desativados += batch.length;
    }
  }

  // 3. Resolve resources per perfil
  const perfilIds = Array.from(allPerfilIds);
  const perfilGroups = new Map<string, Array<{ entra_id: string; nome: string }>>();
  const perfilLicenses = new Map<string, Array<{ sku_id: string; nome: string }>>();
  const perfilApps = new Map<string, Array<{ entra_id: string; nome: string; role_id: string | null }>>();

  if (perfilIds.length > 0) {
    // Groups
    const { data: pg } = await sb
      .from("perfil_grupos")
      .select("perfil_id, grupo_id, entra_grupos(entra_id, nome)")
      .in("perfil_id", perfilIds);
    for (const r of pg || []) {
      const g = r.entra_grupos;
      if (!g?.entra_id) continue;
      if (!perfilGroups.has(r.perfil_id)) perfilGroups.set(r.perfil_id, []);
      perfilGroups.get(r.perfil_id)!.push({ entra_id: g.entra_id, nome: g.nome });
    }
    // Licenses (Entra only — external licenças não têm sku_id no Graph)
    const { data: pl } = await sb
      .from("perfil_licencas")
      .select("perfil_id, licenca_id, entra_licencas(sku_id, nome, friendly_name)")
      .in("perfil_id", perfilIds);
    for (const r of pl || []) {
      const l = r.entra_licencas;
      if (!l?.sku_id) continue;
      if (!perfilLicenses.has(r.perfil_id)) perfilLicenses.set(r.perfil_id, []);
      perfilLicenses.get(r.perfil_id)!.push({ sku_id: l.sku_id, nome: l.friendly_name || l.nome });
    }
    // Apps
    const { data: pa } = await sb
      .from("perfil_aplicacoes")
      .select("perfil_id, aplicacao_id, aplicacoes(entra_id, nome, default_app_role_id)")
      .in("perfil_id", perfilIds);
    for (const r of pa || []) {
      const a = r.aplicacoes;
      if (!a?.entra_id) continue;
      if (!perfilApps.has(r.perfil_id)) perfilApps.set(r.perfil_id, []);
      perfilApps.get(r.perfil_id)!.push({
        entra_id: a.entra_id,
        nome: a.nome,
        role_id: a.default_app_role_id || null,
      });
    }
  }

  // 4. Load individual assignments (manual_individual + entra_sync) with success
  const individualByColab = new Map<string, any[]>();
  for (const batch of chunk(leaverIds, 500)) {
    const { data } = await sb
      .from("iam_queue")
      .select("colaborador_id, action_type, payload_json, target_identity")
      .in("colaborador_id", batch)
      .in("requested_by", ["manual_individual", "entra_sync"])
      .eq("status", "success")
      .in("action_type", ["assign_group", "assign_license", "assign_app"]);
    for (const r of data || []) {
      if (!individualByColab.has(r.colaborador_id)) individualByColab.set(r.colaborador_id, []);
      individualByColab.get(r.colaborador_id)!.push(r);
    }
  }

  // 5. Load already-open remove_* to avoid dup enqueue
  const openRemove = new Set<string>(); // key: colab|action|resourceKey
  for (const batch of chunk(leaverIds, 500)) {
    const { data } = await sb
      .from("iam_queue")
      .select("colaborador_id, action_type, payload_json")
      .in("colaborador_id", batch)
      .in("action_type", ["remove_group", "remove_license", "remove_app"])
      .in("status", ["pending", "waiting_approval", "processing", "success"]);
    for (const r of data || []) {
      const p = r.payload_json || {};
      const rk = r.action_type === "remove_group" ? p.groupId
              : r.action_type === "remove_license" ? p.skuId
              : p.appId;
      if (rk) openRemove.add(`${r.colaborador_id}|${r.action_type}|${rk}`);
    }
  }

  // 6. Build queue entries
  const reverseMap: Record<string, string> = {
    assign_group: "remove_group",
    assign_license: "remove_license",
    assign_app: "remove_app",
  };
  const entries: any[] = [];
  const snapshotByColab = new Map<string, { perfis: string[]; recursos_individuais: any[] }>();

  for (const c of leavers) {
    const target = c.entra_id || c.email || c.sam_account_name;
    if (!target) continue;
    const perfis = atribByColab.get(c.id) || [];
    const snap = { perfis, recursos_individuais: [] as any[] };
    const seenKeys = new Set<string>();

    // Profile-driven
    for (const pid of perfis) {
      for (const g of perfilGroups.get(pid) || []) {
        const k = `remove_group|${g.entra_id}`;
        if (seenKeys.has(k)) continue; seenKeys.add(k);
        if (openRemove.has(`${c.id}|remove_group|${g.entra_id}`)) continue;
        entries.push({
          action_type: "remove_group",
          payload_json: { groupId: g.entra_id, groupName: g.nome, reason: "leaver_reconciliacao" },
          colaborador_id: c.id, target_identity: target,
          requested_by: requestedBy, status: "pending",
        });
        stats.remove_group_enqueued++;
      }
      for (const l of perfilLicenses.get(pid) || []) {
        const k = `remove_license|${l.sku_id}`;
        if (seenKeys.has(k)) continue; seenKeys.add(k);
        if (openRemove.has(`${c.id}|remove_license|${l.sku_id}`)) continue;
        entries.push({
          action_type: "remove_license",
          payload_json: { skuId: l.sku_id, licenseName: l.nome, reason: "leaver_reconciliacao" },
          colaborador_id: c.id, target_identity: target,
          requested_by: requestedBy, status: "pending",
        });
        stats.remove_license_enqueued++;
      }
      for (const a of perfilApps.get(pid) || []) {
        const k = `remove_app|${a.entra_id}`;
        if (seenKeys.has(k)) continue; seenKeys.add(k);
        if (openRemove.has(`${c.id}|remove_app|${a.entra_id}`)) continue;
        entries.push({
          action_type: "remove_app",
          payload_json: { appId: a.entra_id, appName: a.nome, appRoleId: a.role_id, reason: "leaver_reconciliacao" },
          colaborador_id: c.id, target_identity: target,
          requested_by: requestedBy, status: "pending",
        });
        stats.remove_app_enqueued++;
      }
    }

    // Individual (entra_sync / manual_individual)
    for (const item of individualByColab.get(c.id) || []) {
      const p = item.payload_json || {};
      const reverse = reverseMap[item.action_type];
      const rk = item.action_type === "assign_group" ? p.groupId
              : item.action_type === "assign_license" ? p.skuId
              : p.appId;
      if (!reverse || !rk) continue;
      const k = `${reverse}|${rk}`;
      if (seenKeys.has(k)) continue; seenKeys.add(k);
      if (openRemove.has(`${c.id}|${reverse}|${rk}`)) continue;
      snap.recursos_individuais.push({
        action_type: item.action_type, payload_json: p, target_identity: item.target_identity,
      });
      entries.push({
        action_type: reverse,
        payload_json: { ...p, reason: "leaver_reconciliacao" },
        colaborador_id: c.id,
        target_identity: item.target_identity || target,
        requested_by: requestedBy, status: "pending",
      });
      if (reverse === "remove_group") stats.remove_group_enqueued++;
      else if (reverse === "remove_license") stats.remove_license_enqueued++;
      else if (reverse === "remove_app") stats.remove_app_enqueued++;
    }

    snapshotByColab.set(c.id, snap);
  }

  // 7. Insert queue rows
  for (const batch of chunk(entries, 200)) {
    const { error } = await sb.from("iam_queue").insert(batch);
    if (error) stats.errors.push(`insert remove_* iam_queue: ${error.message}`);
  }

  // 8. Update the just-created leaver events with the snapshot
  for (const [colabId, snap] of snapshotByColab) {
    if (snap.perfis.length === 0 && snap.recursos_individuais.length === 0) continue;
    const c = colabById.get(colabId)!;
    await sb.from("eventos_jml")
      .update({
        dados_antes: {
          matricula: c.matricula, nome: c.nome, status: "ativo",
          tipo_desativacao: "hard",
          perfis: snap.perfis,
          recursos_individuais: snap.recursos_individuais,
        },
      })
      .eq("colaborador_id", colabId)
      .eq("tipo", "leaver")
      .eq("origem", "reconciliacao")
      .eq("status", "pendente");
  }
}



async function runReconciliation(sb: any, jobId: string) {
  const stats = {
    total_colabs: 0,
    checked_entra: 0,
    linked_entra: 0,
    already_linked: 0,
    joiners_reconciled: 0,
    leavers_generated: 0,
    disable_enqueued: 0,
    disable_entra_enqueued: 0,
    disable_ad_enqueued: 0,
    skipped_no_entra: 0,
    skipped_ad_unknown: 0,
    skipped_ad_already_disabled: 0,
    skipped_already_disabled: 0,
    perfis_desativados: 0,
    remove_group_enqueued: 0,
    remove_license_enqueued: 0,
    remove_app_enqueued: 0,
    entra_users_indexed: 0,
    create_enqueued: 0,
    enable_enqueued: 0,
    orphans_flagged: 0,
    phantom_colabs_removed: 0,
    phantom_queue_cancelled: 0,
    duplicates: [] as Array<{ colab_id: string; entra_id: string }>,
    errors: [] as string[],
  };

  try {
    // 1. Carrega colaboradores (paginado)
    await updateJob(sb, jobId, { phase: "carregando_colabs", message: "Carregando colaboradores…", users_percent: 5 });
    const list = await fetchAllColabs(sb);
    stats.total_colabs = list.length;
    stats.already_linked = list.filter((c) => c.entra_id).length;
    await updateJob(sb, jobId, {
      phase: "carregando_colabs",
      message: `${list.length.toLocaleString("pt-BR")} colaboradores carregados (${stats.already_linked} já linkados).`,
      users_total: list.length,
      users_percent: 10,
    });

    // 2. Lookup Entra para quem não tem entra_id e tem email
    const needsLookup = list.filter((c) => !c.entra_id && c.email);
    stats.checked_entra = needsLookup.length;

    const token = await getGraphToken();

    if (needsLookup.length > 0) {
      await updateJob(sb, jobId, {
        phase: "consultando_graph",
        message: `Consultando Microsoft Graph para ${needsLookup.length.toLocaleString("pt-BR")} colaboradores…`,
        users_percent: 15,
      });

      const superBatches = chunk(needsLookup, 200);
      let processed = 0;

      for (const superBatch of superBatches) {
        const emails = superBatch.map((c) => c.email!).filter(Boolean);
        const map = await lookupEntraByEmails(token, emails);
        for (const c of superBatch) {
          const match = map.get((c.email || "").toLowerCase());
          if (!match) continue;
          const { error: uerr } = await sb.from("colaboradores").update({ entra_id: match.id }).eq("id", c.id);
          if (uerr) {
            const msg = uerr.message || String(uerr);
            if (uerr.code === "23505" || msg.includes("duplicate key")) {
              stats.duplicates.push({ colab_id: c.id, entra_id: match.id });
            } else {
              stats.errors.push(`update colab ${c.id}: ${msg}`);
            }
            continue;
          }
          stats.linked_entra++;
        }
        processed += superBatch.length;
        const pct = 15 + Math.floor((processed / needsLookup.length) * 40); // 15→55
        await updateJob(sb, jobId, {
          phase: "atualizando_vinculos",
          message: `${processed.toLocaleString("pt-BR")}/${needsLookup.length.toLocaleString("pt-BR")} verificados · ${stats.linked_entra} novos vínculos · ${stats.duplicates.length} duplicidades ignoradas`,
          users_updated: stats.linked_entra,
          users_percent: Math.min(pct, 55),
        });
      }
    }

    // 2.5 Baixa index completo do Entra (para cross-check de disables — evita
    // enfileirar Desabilitar Entra ID para conta que não existe lá).
    await updateJob(sb, jobId, {
      phase: "baixando_entra",
      message: "Baixando index de usuários do Entra ID…",
      users_percent: 57,
    });
    const entraIdx = await fetchAllEntraUsers(token);
    stats.entra_users_indexed = entraIdx.byId.size;
    await updateJob(sb, jobId, {
      phase: "baixando_entra",
      message: `${stats.entra_users_indexed.toLocaleString("pt-BR")} usuários do Entra ID indexados.`,
      users_percent: 60,
    });

    // 3. Recarrega colabs
    await updateJob(sb, jobId, { phase: "resolvendo_joiners", message: "Resolvendo joiners pendentes…", users_percent: 60 });
    const list2 = await fetchAllColabs(sb);
    let effectiveList = list2;

    // 4. Marca joiners pendentes como executados quando colab já existe no Entra
    const linkedIds = list2.filter((c) => c.entra_id).map((c) => c.id);
    if (linkedIds.length > 0) {
      for (const batch of chunk(linkedIds, 500)) {
        const { count, error: jerr } = await sb
          .from("eventos_jml")
          .update({ status: "executado", erro_mensagem: "Reconciliado: já existente no Entra ID" }, { count: "exact" })
          .in("colaborador_id", batch)
          .eq("tipo", "joiner")
          .eq("status", "pendente");
        if (jerr) stats.errors.push(`update joiners: ${jerr.message}`);
        else stats.joiners_reconciled += count || 0;
      }
    }
    await updateJob(sb, jobId, {
      phase: "resolvendo_joiners",
      message: `${stats.joiners_reconciled} joiners marcados como executados.`,
      users_percent: 70,
    });

    // 5. Gera leavers + enqueue disable para desligados sem evento leaver
    await updateJob(sb, jobId, { phase: "gerando_leavers", message: "Gerando eventos leaver…", users_percent: 75 });
    const desligadosAll = list2.filter((c) => c.status === "desligado" || c.status === "inativo");
    const phantomLeavers = desligadosAll.filter((c) => c.origem === "csv" && !resolveEntraMatch(c, entraIdx));
    const phantomLeaverIds = new Set(phantomLeavers.map((c) => c.id));
    if (phantomLeavers.length > 0) {
      await updateJob(sb, jobId, {
        phase: "limpando_fantasmas",
        message: `Removendo ${phantomLeavers.length.toLocaleString("pt-BR")} desligado(s) sem AD/Entra ID…`,
        users_percent: 78,
      });
      await cleanupPhantomLeavers(sb, phantomLeavers, stats);
      effectiveList = list2.filter((c) => !phantomLeaverIds.has(c.id));
    }
    const desligados = desligadosAll.filter((c) => !phantomLeaverIds.has(c.id));
    if (desligados.length > 0) {
      const desligIds = desligados.map((c) => c.id);
      const existingLeavers = new Set<string>();
      for (const batch of chunk(desligIds, 500)) {
        const { data: evs } = await sb
          .from("eventos_jml")
          .select("colaborador_id")
          .in("colaborador_id", batch)
          .eq("tipo", "leaver");
        for (const e of evs || []) existingLeavers.add(e.colaborador_id);
      }
      const missingLeavers = desligados.filter((c) => !existingLeavers.has(c.id));

      if (missingLeavers.length > 0) {
        // Índice do queue existente (por colaborador_id) para evitar duplicar itens abertos
        const missingIds = missingLeavers.map((c) => c.id);
        const openByColab = new Set<string>();
        for (const batch of chunk(missingIds, 500)) {
          const { data: qs } = await sb
            .from("iam_queue")
            .select("colaborador_id, action_type")
            .in("colaborador_id", batch)
            .in("action_type", ["disable", "disable_entra"])
            .in("status", ["pending", "waiting_approval", "processing"]);
          for (const q of qs || []) openByColab.add(`${q.colaborador_id}|${q.action_type}`);
        }

        const leaverEvents = missingLeavers.map((c) => ({
          tipo: "leaver",
          colaborador_id: c.id,
          colaborador_nome: c.nome,
          status: "pendente",
          origem: "reconciliacao",
          dados_antes: { matricula: c.matricula, nome: c.nome, status: "ativo" },
          dados_depois: { status: c.status },
        }));
        for (const batch of chunk(leaverEvents, 200)) {
          const { error: ierr } = await sb.from("eventos_jml").insert(batch);
          if (ierr) stats.errors.push(`insert leaver events: ${ierr.message}`);
          else stats.leavers_generated += batch.length;
        }

        await updateJob(sb, jobId, {
          phase: "enfileirando_disable",
          message: `Analisando ${missingLeavers.length} desligados contra Entra ID…`,
          users_percent: 85,
        });

        // Cross-check cada desligado contra o índice do Entra ID
        const disableEntries: any[] = [];
        for (const c of missingLeavers) {
          const entraMatch = resolveEntraMatch(c, entraIdx);

          // Decisão para Entra ID
          if (!entraMatch) {
            stats.skipped_no_entra++;
          } else if (!entraMatch.accountEnabled) {
            stats.skipped_already_disabled++;
          } else if (!openByColab.has(`${c.id}|disable_entra`)) {
            disableEntries.push({
              action_type: "disable_entra",
              payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "" },
              target_identity: c.sam_account_name || entraMatch.upn || c.email,
              colaborador_id: c.id, requested_by: "reconciliacao", status: "pending",
            });
            stats.disable_entra_enqueued++;
          }

          // Decisão para AD: só enfileira `disable` quando o Entra confirma que a
          // conta é sincronizada on-prem (onPremisesSyncEnabled=true). Se o colab
          // não tem match no Entra, NÃO presumimos que ele existe no AD — o
          // sam_account_name aqui vem derivado do e-mail em sync-csv-colab e não
          // é prova de existência de conta AD. Ambiente Órigo é híbrido AD Connect
          // → Entra, então todo AD real aparece no Entra; exceções raras podem ser
          // tratadas manualmente via "Desabilitar AD" no detalhe do colaborador.
          // Só enfileira se: on-prem sync + conta ainda accountEnabled=true no
          // Entra (AD Connect propaga o estado do AD para o Entra, então
          // accountEnabled=false já indica AD desabilitado — não precisa novo disable).
          const isOnPrem = entraMatch?.onPremisesSyncEnabled === true;
          const adAlreadyDisabled = isOnPrem && entraMatch?.accountEnabled === false;
          if (c.sam_account_name && isOnPrem && entraMatch?.accountEnabled === true && !openByColab.has(`${c.id}|disable`)) {
            disableEntries.push({
              action_type: "disable",
              payload_json: {
                samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "",
                status: "disabled", status_anterior: "ativo", status_novo: c.status,
                changed_fields: ["status"], new_values: { status: "disabled" },
              },
              target_identity: c.sam_account_name,
              colaborador_id: c.id, requested_by: "reconciliacao", status: "pending",
            });
            stats.disable_ad_enqueued++;
          } else if (c.sam_account_name && adAlreadyDisabled) {
            stats.skipped_ad_already_disabled++;
          } else if (c.sam_account_name && !entraMatch) {
            stats.skipped_ad_unknown++;
          }
        }

        for (const batch of chunk(disableEntries, 200)) {
          const { error: qerr } = await sb.from("iam_queue").insert(batch);
          if (qerr) stats.errors.push(`insert iam_queue: ${qerr.message}`);
          else stats.disable_enqueued += batch.length;
        }

        // 5a — Revogar acessos dos leavers (perfis + individuais entra_sync/manual)
        await updateJob(sb, jobId, {
          phase: "revogando_acessos",
          message: `Revogando grupos/licenças/apps de ${missingLeavers.length} desligado(s)…`,
          users_percent: 87,
        });
        await revokeLeaverAccess(sb, missingLeavers, stats, "reconciliacao");
      }
    }

    // 5b/5c/5d — Cobertura completa: joiners faltantes, reativações e órfãos
    await updateJob(sb, jobId, {
      phase: "cobertura_completa",
      message: "Analisando ativos sem conta, reativações e órfãos…",
      users_percent: 90,
    });

    const ativos = effectiveList.filter((c) => c.status === "ativo");

    // Índice de itens já abertos na fila (por colaborador+action_type e para órfãos por entra_id)
    const ativoIds = ativos.map((c) => c.id);
    const openActive = new Set<string>();
    for (const batch of chunk(ativoIds, 500)) {
      if (batch.length === 0) break;
      const { data: qs } = await sb
        .from("iam_queue")
        .select("colaborador_id, action_type")
        .in("colaborador_id", batch)
        .in("action_type", ["create_if_not_exists", "enable_entra"])
        .in("status", ["pending", "waiting_approval", "processing"]);
      for (const q of qs || []) openActive.add(`${q.colaborador_id}|${q.action_type}`);
    }

    const coverageEntries: any[] = [];

    // 5b — Ativo no CSV sem conta no Entra → create_if_not_exists
    // 5c — Ativo no CSV com conta disabled no Entra → enable_entra
    for (const c of ativos) {
      const entraMatch = resolveEntraMatch(c, entraIdx);

      if (!entraMatch) {
        if (!c.email) continue; // sem email não dá para criar
        if (openActive.has(`${c.id}|create_if_not_exists`)) continue;
        const [firstName, ...rest] = (c.nome || "").trim().split(/\s+/);
        const lastName = rest.join(" ");
        coverageEntries.push({
          action_type: "create_if_not_exists",
          payload_json: {
            displayName: c.nome,
            givenName: firstName || c.nome,
            surname: lastName || "",
            mail: c.email,
            userPrincipalName: c.email,
            samAccountName: c.sam_account_name || null,
            usageLocation: "BR",
          },
          target_identity: c.email,
          colaborador_id: c.id,
          requested_by: "reconciliacao",
          status: "pending",
        });
        stats.create_enqueued++;
      } else if (!entraMatch.accountEnabled) {
        if (openActive.has(`${c.id}|enable_entra`)) continue;
        coverageEntries.push({
          action_type: "enable_entra",
          payload_json: {
            samAccountName: c.sam_account_name,
            displayName: c.nome,
            mail: c.email || "",
          },
          target_identity: entraMatch.upn || c.email || c.sam_account_name,
          colaborador_id: c.id,
          requested_by: "reconciliacao",
          status: "pending",
        });
        stats.enable_enqueued++;
      }
    }

    // 5d — Órfãos: conta no Entra ativa sem match em colaboradores nem em contas_admin_conhecidas
    // Constrói set de todos os entra_ids/emails que pertencem a colabs
    const knownEntraIds = new Set<string>();
    const knownEmails = new Set<string>();
    for (const c of effectiveList) {
      if (c.entra_id) knownEntraIds.add(c.entra_id);
      if (c.email) knownEmails.add(c.email.toLowerCase());
    }
    const { data: adminRows } = await sb
      .from("contas_admin_conhecidas")
      .select("entra_id, email");
    for (const a of adminRows || []) {
      if (a.entra_id) knownEntraIds.add(a.entra_id);
      if (a.email) knownEmails.add(String(a.email).toLowerCase());
    }

    // Itens de órfãos já abertos
    const openOrphan = new Set<string>();
    {
      const { data: qs } = await sb
        .from("iam_queue")
        .select("target_identity, payload_json")
        .eq("action_type", "review_orphan_entra")
        .in("status", ["pending", "waiting_approval", "processing"]);
      for (const q of qs || []) {
        const eid = (q.payload_json as any)?.entra_id;
        if (eid) openOrphan.add(String(eid));
        if (q.target_identity) openOrphan.add(String(q.target_identity));
      }
    }

    for (const [eid, eu] of entraIdx.byId) {
      if (!eu.accountEnabled) continue;
      if (knownEntraIds.has(eid)) continue;
      const upnLc = eu.upn?.toLowerCase() || "";
      const mailLc = eu.mail?.toLowerCase() || "";
      if (upnLc && knownEmails.has(upnLc)) continue;
      if (mailLc && knownEmails.has(mailLc)) continue;
      if (openOrphan.has(eid) || (upnLc && openOrphan.has(upnLc))) continue;
      coverageEntries.push({
        action_type: "review_orphan_entra",
        payload_json: {
          entra_id: eid,
          upn: eu.upn,
          mail: eu.mail,
          onPremisesSyncEnabled: eu.onPremisesSyncEnabled,
        },
        target_identity: eu.upn || eu.mail || eid,
        colaborador_id: null,
        requested_by: "reconciliacao",
        status: "pending",
      });
      stats.orphans_flagged++;
    }

    for (const batch of chunk(coverageEntries, 200)) {
      const { error: cerr } = await sb.from("iam_queue").insert(batch);
      if (cerr) stats.errors.push(`insert coverage iam_queue: ${cerr.message}`);
    }

    // 6. Auditoria
    const resumoTxt = `Reconciliação: ${stats.linked_entra} linkados · ${stats.create_enqueued} criações · ${stats.enable_enqueued} reativações · ${stats.leavers_generated} leavers · ${stats.disable_entra_enqueued} disable Entra · ${stats.disable_ad_enqueued} disable AD · ${stats.orphans_flagged} órfãos · ${stats.phantom_colabs_removed} fantasmas removidos · ${stats.phantom_queue_cancelled} filas canceladas · ${stats.skipped_no_entra} pulados · ${stats.skipped_already_disabled} já desabilitados`;
    await sb.from("auditoria").insert({
      entidade: "reconciliacao_identidades",
      acao: "reconciliar",
      resumo: resumoTxt,
      detalhes: stats,
    });

    await updateJob(sb, jobId, {
      status: "done",
      phase: "done",
      users_percent: 100,
      message: resumoTxt,
      error: stats.errors.length ? stats.errors.slice(0, 5).join(" | ") : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("reconcile-identities error:", msg);
    await updateJob(sb, jobId, { status: "error", phase: "error", error: msg, message: `Falha: ${msg}` });
  } finally {
    // Best-effort: promove qualquer job ainda 'running' para 'error' (guard-rail)
    try {
      await sb.from("sync_jobs")
        .update({ status: "error", phase: "timeout", error: "Job finalizou sem atualização final.", updated_at: new Date().toISOString() })
        .eq("id", jobId).eq("status", "running");
    } catch (_e) { /* ignore */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // Libera jobs stale (>10min sem update) antes de iniciar novo
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await sb.from("sync_jobs").update({
      status: "error", phase: "timeout",
      error: "Reconciliação sem atualização recente; liberada para nova execução.",
      updated_at: new Date().toISOString(),
    }).eq("tipo", "reconcile_identities").eq("status", "running").lt("updated_at", staleCutoff);

    // Concurrency guard
    const { data: existing } = await sb.from("sync_jobs")
      .select("id, status, phase, message, users_percent, updated_at")
      .eq("tipo", "reconcile_identities").eq("status", "running")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, already_running: true, job: existing }), { status: 202, headers: corsHeaders });
    }

    const { data: job, error: jobErr } = await sb.from("sync_jobs").insert({
      tipo: "reconcile_identities", status: "running", phase: "iniciando",
      message: "Iniciando reconciliação…", users_percent: 0,
    }).select("id").single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: `Falha ao criar job: ${jobErr?.message}` }), { status: 500, headers: corsHeaders });
    }

    // @ts-ignore EdgeRuntime is Deno Deploy specific
    (globalThis as any).EdgeRuntime?.waitUntil(runReconciliation(sb, job.id));
    // Fallback for local dev where EdgeRuntime is absent
    if (!(globalThis as any).EdgeRuntime) {
      runReconciliation(sb, job.id).catch((e) => console.error("bg run", e));
    }

    return new Response(JSON.stringify({ success: true, started: true, job_id: job.id }), { status: 202, headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("reconcile-identities error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
