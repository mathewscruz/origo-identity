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
      .select("id, nome, email, matricula, status, entra_id, sam_account_name")
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

async function updateJob(sb: any, jobId: string, patch: Record<string, unknown>) {
  await sb.from("sync_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
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

    if (needsLookup.length > 0) {
      await updateJob(sb, jobId, {
        phase: "consultando_graph",
        message: `Consultando Microsoft Graph para ${needsLookup.length.toLocaleString("pt-BR")} colaboradores…`,
        users_percent: 15,
      });

      const token = await getGraphToken();
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

    // 3. Recarrega colabs
    await updateJob(sb, jobId, { phase: "resolvendo_joiners", message: "Resolvendo joiners pendentes…", users_percent: 60 });
    const list2 = await fetchAllColabs(sb);

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
    const desligados = list2.filter((c) => c.status === "desligado" || c.status === "inativo");
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
        const targetIds = missingLeavers.filter((c) => c.sam_account_name).map((c) => c.sam_account_name!);
        const existingDisables = new Set<string>();
        for (const batch of chunk(targetIds, 500)) {
          const { data: qs } = await sb
            .from("iam_queue")
            .select("target_identity")
            .in("target_identity", batch)
            .eq("action_type", "disable_entra");
          for (const q of qs || []) existingDisables.add(q.target_identity);
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
          message: `Enfileirando ${missingLeavers.length} desabilitações…`,
          users_percent: 85,
        });

        const disableEntries = missingLeavers
          .filter((c) => c.sam_account_name && !existingDisables.has(c.sam_account_name!))
          .flatMap((c) => [
            {
              action_type: "disable",
              payload_json: {
                samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "",
                status: "disabled", status_anterior: "ativo", status_novo: c.status,
                changed_fields: ["status"], new_values: { status: "disabled" },
              },
              target_identity: c.sam_account_name,
              colaborador_id: c.id, requested_by: "reconciliacao", status: "pending",
            },
            {
              action_type: "disable_entra",
              payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "" },
              target_identity: c.sam_account_name,
              colaborador_id: c.id, requested_by: "reconciliacao", status: "pending",
            },
          ]);
        for (const batch of chunk(disableEntries, 200)) {
          const { error: qerr } = await sb.from("iam_queue").insert(batch);
          if (qerr) stats.errors.push(`insert iam_queue: ${qerr.message}`);
          else stats.disable_enqueued += batch.length;
        }
      }
    }

    // 6. Auditoria
    await sb.from("auditoria").insert({
      entidade: "reconciliacao_identidades",
      acao: "reconciliar",
      resumo: `Reconciliação: ${stats.linked_entra} linkados, ${stats.duplicates.length} duplicidades, ${stats.joiners_reconciled} joiners resolvidos, ${stats.leavers_generated} leavers, ${stats.disable_enqueued} desabilitações`,
      detalhes: stats,
    });

    await updateJob(sb, jobId, {
      status: "done",
      phase: "done",
      users_percent: 100,
      message: `Concluído: ${stats.linked_entra} vínculos novos · ${stats.duplicates.length} duplicidades · ${stats.joiners_reconciled} joiners · ${stats.leavers_generated} leavers · ${stats.disable_enqueued} disable enfileirados`,
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
