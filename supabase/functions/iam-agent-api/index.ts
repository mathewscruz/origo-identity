// API consumida pelo Órigo/Hermes agent — o ÚNICO executor de ações em AD, Entra ID,
// SharePoint, apps externos e reset de senha.
//
//   GET  /pending   → RESERVA (claim) até N itens pendentes: status=processing + claim_token + lease.
//                     Cada item vem com `identity` (e-mail/SAM/entra_id resolvidos do colaborador/terceiro).
//   POST /update    → conclui um item reservado: { id, claim_token, status: success|failed|cancelled, ... }
//                     falhas retentáveis voltam para pending com backoff.
//                     `secret` (senha temporária de reset_password) é entregue por e-mail ao solicitante
//                     e NUNCA persistido.
//   POST /release   → devolve um item reservado para pending sem executar: { id, claim_token, reason }
//   GET  /health    → diagnóstico (fila, último heartbeat do agente)
//
// Autenticação: Bearer IAM_AGENT_TOKEN (agente) ou JWT de usuário admin/operador.
// Heartbeat: cada chamada do agente atualiza iam_agent_status (dashboard mostra online/offline).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole, serviceAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-agent-version, x-agent-host, x-agent-execute",
  "Content-Type": "application/json",
};

// Erros que justificam nova tentativa (com backoff exponencial)
const RETRYABLE_ERRORS = new Set([
  "user_not_found", "user_not_synced", "not_found_in_entra", "replication_pending",
  "AD_AGENT_ERROR", "ad_ldap_not_configured", "ad_bridge_missing", "graph_concurrency_violation",
  "graph_throttled", "network_error", "dry_run",
]);
// Erros de identidade ausente: poucas tentativas (não é transitório)
const IDENTITY_ERRORS = new Set(["user_not_found", "not_found_in_entra", "user_not_synced"]);

// Tudo o que o agente executa (nenhuma outra função escreve em AD/Entra/apps)
export const AGENT_ACTION_TYPES = [
  "create", "create_if_not_exists", "update", "disable", "reset_password",
  "assign_group", "remove_group",
  "assign_license", "remove_license",
  "assign_app", "remove_app",
  "assign_sharepoint", "remove_sharepoint",
  "disable_entra", "enable_entra", "update_entra",
  "create_user_app", "update_user_app", "disable_user_app", "delete_user_app",
];

const DEFAULT_LEASE_SECONDS = 300;
const MAX_BATCH = 50;

type Sb = ReturnType<typeof createClient>;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function calculateNextRetry(retryCount: number): string {
  // 5min, 10min, 20min, 40min, 80min … (teto de 6h)
  const delayMinutes = Math.min(5 * Math.pow(2, Math.max(retryCount - 1, 0)), 360);
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

async function authorize(
  req: Request,
): Promise<{ ok: true; method: "agent_token" | "user_jwt"; actor: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  }
  const bearer = authHeader.slice(7).trim();
  const expected = Deno.env.get("IAM_AGENT_TOKEN") || "";
  if (expected && bearer.length === expected.length) {
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= bearer.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) return { ok: true, method: "agent_token", actor: "origo-agent" };
  }
  const roleCheck = await requireRole(req, ["admin", "operador"]);
  if (roleCheck instanceof Response) return { ok: false, response: roleCheck };
  return { ok: true, method: "user_jwt", actor: roleCheck.email };
}

async function readParams(supabase: Sb) {
  const { data } = await supabase.from("parametros").select("chave, valor").in("chave", ["iam_enable_requires_approval"]);
  const map = new Map<string, string>((data || []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
  return { enableRequiresApproval: (map.get("iam_enable_requires_approval") ?? "true") !== "false" };
}

/** Registra o heartbeat do agente (best-effort). */
async function heartbeat(supabase: Sb, req: Request, owner: string, kind: "poll" | "claim" | "result", details: Record<string, unknown> = {}) {
  const version = req.headers.get("x-agent-version");
  const host = req.headers.get("x-agent-host");
  const execute = req.headers.get("x-agent-execute");
  const payload: Record<string, unknown> = { ...details };
  if (version) payload.version = version;
  if (host) payload.host = host;
  if (execute !== null) payload.execute = execute === "1" || execute === "true";
  const { error } = await supabase.rpc("iam_agent_heartbeat", { p_owner: owner, p_kind: kind, p_details: payload });
  if (error) console.warn("[iam-agent-api] heartbeat:", error.message);
}

/** Anexa a identidade resolvida (colaborador/terceiro) a cada item reservado. */
async function enrichIdentity(supabase: Sb, items: Record<string, unknown>[]) {
  const colabIds = [...new Set(items.map((i) => i.colaborador_id).filter(Boolean))] as string[];
  const tercIds = [...new Set(items.map((i) => i.terceiro_id).filter(Boolean))] as string[];
  const colabs = new Map<string, Record<string, unknown>>();
  const tercs = new Map<string, Record<string, unknown>>();
  if (colabIds.length) {
    const { data } = await supabase.from("colaboradores").select("id, nome, email, sam_account_name, entra_id, status").in("id", colabIds);
    for (const c of data || []) colabs.set(c.id, c);
  }
  if (tercIds.length) {
    const { data } = await supabase.from("terceiros").select("id, nome, email, sam_account_name, ativo").in("id", tercIds);
    for (const t of data || []) tercs.set(t.id, t);
  }
  return items.map((item) => {
    const payload = (item.payload_json || {}) as Record<string, unknown>;
    const c = item.colaborador_id ? colabs.get(item.colaborador_id as string) : undefined;
    const t = item.terceiro_id ? tercs.get(item.terceiro_id as string) : undefined;
    const identity = {
      tipo: c ? "colaborador" : t ? "terceiro" : null,
      nome: (c?.nome ?? t?.nome ?? payload.displayName ?? null) as string | null,
      email: (c?.email ?? t?.email ?? payload.mail ?? payload.email ?? null) as string | null,
      sam: (c?.sam_account_name ?? t?.sam_account_name ?? payload.samAccountName ?? payload.sAMAccountName ?? null) as string | null,
      entra_id: (c?.entra_id ?? payload.entra_id ?? null) as string | null,
      target_identity: (item.target_identity ?? null) as string | null,
      status: (c?.status ?? (t ? (t.ativo ? "ativo" : "inativo") : null)) as string | null,
    };
    return { ...item, identity };
  });
}

/** Entrega a senha temporária ao solicitante por e-mail (nunca grava). */
async function deliverSecret(item: Record<string, unknown>, secret: string): Promise<{ ok: boolean; to: string | null; error?: string }> {
  const payload = (item.payload_json || {}) as Record<string, unknown>;
  const to = String(payload.deliver_to || item.requested_by || "");
  if (!to.includes("@")) return { ok: false, to: null, error: "solicitante sem e-mail" };
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: serviceAuthHeader() },
      body: JSON.stringify({
        tipo: "senha_temporaria",
        payload: {
          destinatario_email: to,
          colaborador_nome: payload.displayName || item.target_identity,
          conta: item.target_identity,
          senha: secret,
          solicitante: item.requested_by,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, to, error: `send-notification-email ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, to };
  } catch (err) {
    return { ok: false, to, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authResult = await authorize(req);
  if (!authResult.ok) return authResult.response;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();
  const owner = url.searchParams.get("owner") || authResult.actor;
  const isAgent = authResult.method === "agent_token";

  // ─── GET /health ───
  if (req.method === "GET" && path === "health") {
    const { enableRequiresApproval } = await readParams(supabase);
    const { data: stats } = await supabase.rpc("iam_queue_stats");
    const { data: agents } = await supabase.from("iam_agent_status").select("*").order("last_seen_at", { ascending: false });
    if (isAgent) await heartbeat(supabase, req, owner, "poll");
    return jsonResponse({
      ok: true, auth: authResult.method, executor: "origo-agent", action_types: AGENT_ACTION_TYPES,
      enable_requires_approval: enableRequiresApproval, queue: stats, agents: agents || [],
    });
  }

  // ─── GET /pending → claim ───
  if (req.method === "GET" && path === "pending") {
    const { enableRequiresApproval } = await readParams(supabase);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), MAX_BATCH);
    const lease = Math.max(parseInt(url.searchParams.get("lease") || String(DEFAULT_LEASE_SECONDS), 10) || DEFAULT_LEASE_SECONDS, 30);

    const { data, error } = await supabase.rpc("claim_iam_queue_items", {
      p_owner: owner, p_limit: limit, p_lease_seconds: lease, p_action_types: AGENT_ACTION_TYPES,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
    const items = await enrichIdentity(supabase, (data || []) as Record<string, unknown>[]);
    if (isAgent) await heartbeat(supabase, req, owner, items.length ? "claim" : "poll", { last_batch: items.length });
    return jsonResponse({
      success: true, count: items.length, data: items,
      action_types: AGENT_ACTION_TYPES, lease_seconds: lease, owner,
      enable_requires_approval: enableRequiresApproval,
    });
  }

  // ─── POST /release ───
  if (req.method === "POST" && path === "release") {
    const body = await req.json().catch(() => null) as { id?: string; claim_token?: string; reason?: string } | null;
    if (!body?.id || !body.claim_token) return jsonResponse({ error: "id and claim_token are required" }, 400);
    const { data, error } = await supabase.rpc("complete_iam_queue_item", {
      p_id: body.id, p_claim_token: body.claim_token, p_status: "pending",
      p_result_message: body.reason ? `Liberado pelo executor: ${body.reason}` : null,
      p_processed_by: authResult.actor, p_error_code: null, p_next_retry_at: null,
    });
    if (error) return jsonResponse({ error: error.message }, 409);
    if (isAgent) await heartbeat(supabase, req, owner, "poll");
    return jsonResponse({ success: true, data });
  }

  // ─── POST /update ───
  if (req.method === "POST" && path === "update") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const { id, status, processed_by, target_identity, error_code, secret } = body as {
      id?: string; status?: string; result_message?: string; processed_by?: string; target_identity?: string; error_code?: string; secret?: string;
    };
    let resultMessage = (body.result_message as string | undefined) ?? undefined;
    let claimToken = (body.claim_token as string | undefined) || undefined;
    if (!id || !status) return jsonResponse({ error: "id and status are required" }, 400);
    if (!["success", "failed", "cancelled", "pending"].includes(status)) {
      return jsonResponse({ error: `status inválido: ${status} (use success|failed|cancelled|pending)` }, 400);
    }

    const { data: current, error: curErr } = await supabase
      .from("iam_queue")
      .select("id, status, action_type, retry_count, max_retries, claim_token, claim_owner, requested_by, target_identity, payload_json")
      .eq("id", id)
      .maybeSingle();
    if (curErr) return jsonResponse({ error: curErr.message }, 500);
    if (!current) return jsonResponse({ error: "Item não encontrado" }, 404);

    // Compatibilidade com agentes que ainda não enviam claim_token: aceita se o item
    // está reservado para o mesmo executor.
    if (!claimToken) {
      if (current.status === "processing" && current.claim_token && current.claim_owner === (processed_by || authResult.actor)) {
        claimToken = current.claim_token;
      } else {
        return jsonResponse({
          error: "claim_token é obrigatório (obtenha o item via GET /pending). Item não está reservado para este executor.",
          item_status: current.status, claim_owner: current.claim_owner,
        }, 409);
      }
    }
    if (current.status !== "processing") {
      return jsonResponse({ error: `Item está em '${current.status}', não em processing`, item_status: current.status }, 409);
    }

    // Senha temporária (reset_password): entrega por e-mail, nunca persiste
    let finalStatus = status;
    let finalErrorCode = error_code ?? null;
    if (current.action_type === "reset_password" && status === "success") {
      if (!secret) {
        finalStatus = "failed"; finalErrorCode = "secret_missing";
        resultMessage = "Agente reportou sucesso sem informar a senha temporária (campo secret).";
      } else {
        const delivered = await deliverSecret(current as Record<string, unknown>, String(secret));
        if (delivered.ok) {
          resultMessage = `Senha temporária definida e enviada por e-mail para ${delivered.to}.`;
        } else {
          finalStatus = "failed"; finalErrorCode = "secret_delivery_failed";
          resultMessage = `Senha alterada no diretório, mas a senha temporária NÃO pôde ser entregue (${delivered.error}). Refaça o reset após corrigir o envio de e-mail.`;
        }
      }
    }

    // Falha retentável → volta para pending com backoff
    let nextRetryAt: string | null = null;
    let retryCount: number = current.retry_count ?? 0;
    let retried = false;
    if (finalStatus === "failed" && finalErrorCode && RETRYABLE_ERRORS.has(finalErrorCode)) {
      const effectiveMax = IDENTITY_ERRORS.has(finalErrorCode)
        ? Math.min(3, current.max_retries ?? 3)
        : (current.max_retries ?? 10);
      if (retryCount < effectiveMax) {
        retryCount += 1;
        nextRetryAt = calculateNextRetry(retryCount);
        finalStatus = "pending";
        retried = true;
      }
    }

    const { data, error: rpcErr } = await supabase.rpc("complete_iam_queue_item", {
      p_id: id,
      p_claim_token: claimToken,
      p_status: finalStatus,
      p_result_message: retried
        ? `Retry ${retryCount}/${current.max_retries ?? 10} — ${finalErrorCode}: ${resultMessage || ""}`.trim()
        : (resultMessage ?? null),
      p_processed_by: processed_by || authResult.actor,
      p_error_code: finalErrorCode,
      p_next_retry_at: nextRetryAt,
      p_retry_count: retryCount,
      p_target_identity: target_identity ?? null,
    });
    if (rpcErr) return jsonResponse({ error: rpcErr.message }, 409);

    if (finalStatus === "failed") {
      const item = data as Record<string, unknown>;
      await supabase.from("alertas").insert({
        titulo: `Falha: ${item.action_type}`,
        mensagem: `Ação ${item.action_type} falhou para ${item.target_identity || "?"}: ${resultMessage || finalErrorCode || "sem detalhes"}`,
        severidade: "critico", tipo: "provisionamento_falha",
        ref_url: "/fila-provisionamento", ref_id: id, ref_tipo: "iam_queue",
      });
    }
    if (isAgent) await heartbeat(supabase, req, owner, "result", { result: `${current.action_type}: ${finalStatus}` });

    return jsonResponse({ success: true, status: finalStatus, retried, retry_count: retryCount, next_retry_at: nextRetryAt, data });
  }

  return jsonResponse({ error: "Not found. Use GET /pending, POST /update, POST /release ou GET /health" }, 404);
});
