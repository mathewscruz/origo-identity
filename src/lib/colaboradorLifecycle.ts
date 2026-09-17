import { supabase } from "@/integrations/supabase/client";
import { authedFetch } from "@/lib/authedFetch";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";

interface ColabInfo {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
  cargo_id: string | null;
  gestor_id: string | null;
  origem: string | null;
}

interface StatusChangeParams {
  colab: ColabInfo;
  oldStatus: string;
  newStatus: string;
  operadorEmail: string | null;
  operadorNome: string | null;
  motivo?: string | null;
  /** If true, skip the colaboradores.update({status}) — caller already did it */
  skipStatusUpdate?: boolean;
}

export interface StatusChangeResult {
  success: boolean;
  error?: string;
  blocked?: boolean;
  tipo_desativacao?: "hard" | "soft" | null;
  remocoes_enfileiradas?: number;
  restaurados?: number;
}

/**
 * Ciclo de vida do colaborador (leaver / soft disable / reativação).
 *
 * Toda a lógica roda no banco, numa única transação (RPC `jml_alterar_status`):
 * checagem de exceção "manter ativo", status, auditoria, alerta, disable/enable de
 * contas, revogação de perfis, remoção de acessos pelo ACESSO EFETIVO, snapshot e
 * evento JML. Aqui só ficam a chamada, a notificação ao gestor e o disparo da fila.
 */
export async function handleStatusChange(params: StatusChangeParams): Promise<StatusChangeResult> {
  const { colab, oldStatus, newStatus, operadorEmail, operadorNome } = params;

  const { data, error } = await supabase.rpc("jml_alterar_status", {
    p_colaborador_id: colab.id,
    p_novo_status: newStatus,
    p_operador: operadorEmail || operadorNome || "sistema",
    p_origem: "manual",
    p_motivo: params.motivo ?? null,
    p_skip_status_update: !!params.skipStatusUpdate,
  });
  if (error) return { success: false, error: error.message };

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) {
    return { success: false, error: String(r.error ?? "Operação recusada"), blocked: r.blocked === true };
  }

  // Notifica o gestor (best-effort) quando houve desativação
  const gestorEmail = r.gestor_email as string | null | undefined;
  if (gestorEmail && r.tipo_desativacao) {
    sendNotificationEmail("colaborador_desabilitado", {
      destinatario_email: gestorEmail,
      colaborador_nome: colab.nome,
      status_anterior: oldStatus,
      novo_status: newStatus,
      operador: operadorNome || operadorEmail || "Sistema",
      colaborador_id: colab.id,
    });
  }

  return {
    success: true,
    tipo_desativacao: (r.tipo_desativacao as "hard" | "soft" | null) ?? null,
    remocoes_enfileiradas: Number(r.remocoes_enfileiradas ?? 0),
    restaurados: Number(r.restaurados ?? 0),
  };
}

/**
 * Trigger sync-user-access for a single collaborator.
 * Works regardless of status (allows syncing inactive users).
 */
export async function syncSingleUserAccess(colaboradorId: string): Promise<{ success: boolean; queued?: number; groups?: number; licenses?: number; apps?: number; message?: string }> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-user-access`;
    const res = await authedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colaborador_id: colaboradorId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.error || `HTTP ${res.status}` };
    return {
      success: true,
      queued: data.queued,
      groups: data.groups,
      licenses: data.licenses,
      apps: data.apps,
      message: data.skipped ? data.message : undefined,
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}
