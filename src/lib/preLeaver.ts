import { supabase } from "@/integrations/supabase/client";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";

interface ColabRef {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
  gestor_id: string | null;
}

interface OperadorRef {
  email: string | null;
  nome: string | null;
}

/**
 * Suspensão Preventiva ("Pré-Desligamento"): bloqueia sign-in no Entra ID (com
 * revogação de sessões) e desabilita a conta no AD on-prem IMEDIATAMENTE, sem
 * revogar licenças/grupos/perfis. Transacional no banco (RPC `jml_pre_leaver`).
 */
export async function suspendColaboradorPreventivo(
  colab: ColabRef,
  motivo: string,
  operador: OperadorRef,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("jml_pre_leaver", {
    p_colaborador_id: colab.id,
    p_motivo: motivo,
    p_operador: operador.email || operador.nome || "sistema",
  });
  if (error) return { success: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) return { success: false, error: String(r.error ?? "Operação recusada") };

  const gestorEmail = r.gestor_email as string | null | undefined;
  if (gestorEmail) {
    sendNotificationEmail("colaborador_desabilitado" as any, {
      destinatario_email: gestorEmail,
      colaborador_nome: colab.nome,
      status_anterior: "ativo",
      novo_status: "suspensão preventiva",
      operador: operador.nome || operador.email || "Sistema",
      colaborador_id: colab.id,
      justificativa: motivo.trim(),
    });
  }
  return { success: true };
}

/**
 * Reverte uma suspensão preventiva (RPC `jml_pre_leaver_reverter`). A reabilitação
 * das contas entra na fila aguardando aprovação (parâmetro iam_enable_requires_approval).
 */
export async function revertSuspensaoPreventiva(
  colab: ColabRef,
  motivo: string,
  operador: OperadorRef,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("jml_pre_leaver_reverter", {
    p_colaborador_id: colab.id,
    p_motivo: motivo,
    p_operador: operador.email || operador.nome || "sistema",
  });
  if (error) return { success: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) return { success: false, error: String(r.error ?? "Operação recusada") };
  return { success: true };
}
