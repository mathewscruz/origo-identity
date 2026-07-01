// Ciclo diário: orquestra sync-sharepoint-csv → reconcile-identities → process-iam-queue
// Reporta progresso via sync_jobs (tipo='daily_cycle').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFn(name: string, auth: string, body?: unknown): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function updateJob(sb: any, jobId: string, patch: Record<string, unknown>) {
  await sb.from("sync_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
}

async function waitForJob(sb: any, tipo: string, sinceIso: string, timeoutMs: number): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastJob: any = null;
  while (Date.now() < deadline) {
    const { data } = await sb.from("sync_jobs")
      .select("*").eq("tipo", tipo).gte("created_at", sinceIso)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      lastJob = data;
      if (data.status === "done" || data.status === "error") return data;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return lastJob ?? { status: "error", error: "Timeout aguardando conclusão." };
}

async function runCycle(sb: any, jobId: string, auth: string, opts: { skipCsv: boolean }) {
  const summary: Record<string, any> = { steps: [] };
  try {
    // Etapa 1: SharePoint CSV
    if (!opts.skipCsv) {
      await updateJob(sb, jobId, { phase: "sharepoint_csv", message: "Buscando CSV mais recente no SharePoint…", users_percent: 5 });
      const started = new Date().toISOString();
      const r = await callFn("sync-sharepoint-csv", auth);
      if (!r.ok) throw new Error(`SharePoint: ${r.body?.error || r.status}`);
      const j = await waitForJob(sb, "csv_colab", started, 10 * 60 * 1000);
      summary.steps.push({ step: "sharepoint_csv", status: j.status, colab_created: j.colab_created, colab_updated: j.colab_updated, colab_inativos: j.colab_inativos });
      if (j.status === "error") throw new Error(`CSV: ${j.error || "falha"}`);
      await updateJob(sb, jobId, { phase: "sharepoint_csv", message: `CSV: ${j.colab_created || 0} criados · ${j.colab_updated || 0} atualizados · ${j.colab_inativos || 0} inativados.`, users_percent: 35 });
    } else {
      await updateJob(sb, jobId, { phase: "sharepoint_csv", message: "Etapa CSV pulada (já sincronizado).", users_percent: 35 });
    }

    // Etapa 2: reconcile-identities
    await updateJob(sb, jobId, { phase: "reconcile", message: "Reconciliando identidades contra o Entra ID…", users_percent: 40 });
    const startedR = new Date().toISOString();
    const rr = await callFn("reconcile-identities", auth);
    if (!rr.ok && rr.status !== 202) throw new Error(`Reconcile: ${rr.body?.error || rr.status}`);
    const jr = await waitForJob(sb, "reconcile_identities", startedR, 15 * 60 * 1000);
    summary.steps.push({ step: "reconcile_identities", status: jr.status, message: jr.message });
    if (jr.status === "error") throw new Error(`Reconcile: ${jr.error || "falha"}`);
    await updateJob(sb, jobId, { phase: "reconcile", message: jr.message || "Reconciliação concluída.", users_percent: 70 });

    // Etapa 3: process-iam-queue (força execução)
    await updateJob(sb, jobId, { phase: "processando_fila", message: "Processando fila IAM (disable/enable/assign)…", users_percent: 75 });
    const rp = await callFn("process-iam-queue", auth, { force: true });
    if (!rp.ok) throw new Error(`Fila IAM: ${rp.body?.error || rp.status}`);
    summary.steps.push({ step: "process_iam_queue", status: "done", summary: rp.body?.summary || rp.body });
    await updateJob(sb, jobId, { phase: "processando_fila", message: `Fila processada: ${JSON.stringify(rp.body?.summary || {})}`, users_percent: 95 });

    await sb.from("auditoria").insert({
      entidade: "ciclo_diario",
      acao: "executar",
      resumo: `Ciclo diário concluído (${summary.steps.length} etapas)`,
      detalhes: summary,
    });

    await updateJob(sb, jobId, { status: "done", phase: "done", users_percent: 100, message: "Ciclo diário concluído." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("run-daily-cycle:", msg);
    await updateJob(sb, jobId, { status: "error", phase: "error", error: msg, message: `Falha: ${msg}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const authHeader = req.headers.get("Authorization")!;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const skipCsv = !!body.skip_csv;

  try {
    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await sb.from("sync_jobs").update({
      status: "error", phase: "timeout", error: "Ciclo diário sem atualização recente.",
      updated_at: new Date().toISOString(),
    }).eq("tipo", "daily_cycle").eq("status", "running").lt("updated_at", staleCutoff);

    const { data: existing } = await sb.from("sync_jobs")
      .select("id, status, phase, message, users_percent, updated_at")
      .eq("tipo", "daily_cycle").eq("status", "running")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, already_running: true, job: existing }), { status: 202, headers: corsHeaders });
    }

    const { data: job, error: jobErr } = await sb.from("sync_jobs").insert({
      tipo: "daily_cycle", status: "running", phase: "iniciando",
      message: "Iniciando ciclo diário…", users_percent: 0,
    }).select("id").single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: `Falha ao criar job: ${jobErr?.message}` }), { status: 500, headers: corsHeaders });
    }

    // @ts-ignore
    (globalThis as any).EdgeRuntime?.waitUntil(runCycle(sb, job.id, authHeader, { skipCsv }));
    if (!(globalThis as any).EdgeRuntime) {
      runCycle(sb, job.id, authHeader, { skipCsv }).catch((e) => console.error("bg", e));
    }

    return new Response(JSON.stringify({ success: true, started: true, job_id: job.id }), { status: 202, headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
