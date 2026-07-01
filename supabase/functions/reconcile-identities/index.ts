// Reconciliação de identidades: linka colaboradores existentes ao Entra ID via Graph,
// gera eventos leaver para desligados sem evento, e marca joiners pendentes como executados
// quando o colaborador já existe no Entra ID.
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

// Consulta Graph em batch para descobrir userId por email/UPN.
// Retorna map: emailLower -> { id, userPrincipalName }
async function lookupEntraByEmails(
  token: string,
  emails: string[],
): Promise<Map<string, { id: string; upn: string }>> {
  const result = new Map<string, { id: string; upn: string }>();
  // Graph aceita até 20 requests por $batch; usamos filter individual pra evitar limites de tamanho no OR
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
    // pequena pausa para evitar throttling
    await new Promise((r) => setTimeout(r, 100));
  }
  return result;
}

async function processReconciliation(sb: any) {
  const stats = {
    total_colabs: 0,
    checked_entra: 0,
    linked_entra: 0,
    already_linked: 0,
    joiners_reconciled: 0,
    leavers_generated: 0,
    disable_enqueued: 0,
    errors: [] as string[],
  };

  // 1. Carrega todos colaboradores
  const { data: colabs, error } = await sb
    .from("colaboradores")
    .select("id, nome, email, matricula, status, entra_id, sam_account_name");
  if (error) throw new Error(`Falha ao carregar colaboradores: ${error.message}`);
  const list = (colabs || []) as Colab[];
  stats.total_colabs = list.length;
  stats.already_linked = list.filter((c) => c.entra_id).length;

  // 2. Reconciliação Entra (só para quem não tem entra_id e tem email)
  const needsLookup = list.filter((c) => !c.entra_id && c.email);
  stats.checked_entra = needsLookup.length;

  if (needsLookup.length > 0) {
    let token: string;
    try {
      token = await getGraphToken();
    } catch (e) {
      throw new Error(`Não foi possível obter token do Graph: ${(e as Error).message}`);
    }

    // Processa em blocos de 200 para gravar em batch e manter progresso
    const superBatches = chunk(needsLookup, 200);
    for (const superBatch of superBatches) {
      const emails = superBatch.map((c) => c.email!).filter(Boolean);
      const map = await lookupEntraByEmails(token, emails);
      const updates: Array<{ id: string; entra_id: string }> = [];
      for (const c of superBatch) {
        const match = map.get((c.email || "").toLowerCase());
        if (match) {
          updates.push({ id: c.id, entra_id: match.id });
        }
      }
      // Atualiza um a um (Supabase não faz update em massa com valores distintos)
      for (const u of updates) {
        const { error: uerr } = await sb.from("colaboradores").update({ entra_id: u.entra_id }).eq("id", u.id);
        if (uerr) {
          stats.errors.push(`update colab ${u.id}: ${uerr.message}`);
          continue;
        }
        stats.linked_entra++;
      }
    }
  }

  // 3. Recarrega colabs com entra_id atualizado
  const { data: colabs2 } = await sb
    .from("colaboradores")
    .select("id, status, entra_id, nome, sam_account_name, email");
  const list2 = (colabs2 || []) as Colab[];

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

  // 5. Gera eventos leaver + enqueue disable para desligados sem evento leaver
  const desligados = list2.filter(
    (c) => c.status === "desligado" || c.status === "inativo",
  );
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
      // Também precisamos evitar duplicar disable pendentes na iam_queue
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

      const disableEntries = missingLeavers
        .filter((c) => c.sam_account_name && !existingDisables.has(c.sam_account_name!))
        .flatMap((c) => [
          {
            action_type: "disable",
            payload_json: {
              samAccountName: c.sam_account_name,
              displayName: c.nome,
              mail: c.email || "",
              status: "disabled",
              status_anterior: "ativo",
              status_novo: c.status,
              changed_fields: ["status"],
              new_values: { status: "disabled" },
            },
            target_identity: c.sam_account_name,
            colaborador_id: c.id,
            requested_by: "reconciliacao",
            status: "pending",
          },
          {
            action_type: "disable_entra",
            payload_json: { samAccountName: c.sam_account_name, displayName: c.nome, mail: c.email || "" },
            target_identity: c.sam_account_name,
            colaborador_id: c.id,
            requested_by: "reconciliacao",
            status: "pending",
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
    resumo: `Reconciliação: ${stats.linked_entra} linkados no Entra, ${stats.joiners_reconciled} joiners resolvidos, ${stats.leavers_generated} leavers gerados`,
    detalhes: stats,
  });

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const stats = await processReconciliation(sb);
    return new Response(JSON.stringify({ success: true, stats }), { status: 200, headers: corsHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("reconcile-identities error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
