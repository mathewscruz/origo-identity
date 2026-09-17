/**
 * Ciclo de vida de terceiros — wrappers do RPC transacional `terceiro_alterar_status`.
 *
 * O banco cuida de: flag ativo, revogação de perfis, remoção de acessos pelo
 * acesso efetivo, disable/enable de contas (reabilitação aguarda aprovação),
 * snapshot para reativação, evento JML, auditoria e alertas.
 * A mesma função é usada pela expiração automática de contrato.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TerceiroIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
  empresa_terceira?: string | null;
}

export interface OperatorContext {
  email: string | null;
  nome: string | null;
}

export interface LifecycleResult {
  success: boolean;
  message?: string;
  error?: string;
  perfisRevogados?: number;
  perfisRestaurados?: number;
  individuaisRestaurados?: number;
  remocoes?: number;
}

async function call(t: TerceiroIdentity, ativo: boolean, operator: OperatorContext, motivo?: string | null): Promise<LifecycleResult> {
  const { data, error } = await supabase.rpc("terceiro_alterar_status", {
    p_terceiro_id: t.id,
    p_ativo: ativo,
    p_operador: operator.email || operator.nome || "sistema",
    p_origem: "manual",
    p_motivo: motivo ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) return { success: false, error: String(r.error ?? "Operação recusada") };
  return {
    success: true,
    perfisRevogados: Number(r.perfisRevogados ?? 0),
    perfisRestaurados: Number(r.perfisRestaurados ?? 0),
    individuaisRestaurados: Number(r.individuaisRestaurados ?? 0),
    remocoes: Number(r.remocoes ?? 0),
  };
}

/** Desligamento: revoga perfis, desabilita contas e enfileira remoções. */
export async function desligarTerceiro(
  t: TerceiroIdentity,
  operator: OperatorContext,
  _atribuicoes?: Array<{ perfil_id: string }>,
  motivo?: string | null,
): Promise<LifecycleResult> {
  return call(t, false, operator, motivo);
}

/** Reativação: restaura perfis do último desligamento; reabilitação de contas aguarda aprovação. */
export async function reativarTerceiro(
  t: TerceiroIdentity,
  operator: OperatorContext,
  motivo?: string | null,
): Promise<LifecycleResult> {
  return call(t, true, operator, motivo);
}
