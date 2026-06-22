import { supabase } from "@/integrations/supabase/client";
import { createEventoJML } from "@/lib/createEventoJML";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";
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
 * Suspensão Preventiva ("Pré-Desligamento"):
 * Bloqueia sign-in no Entra ID e desabilita conta no AD on-prem IMEDIATAMENTE,
 * sem revogar licenças, grupos, perfis ou apps. Marca o colaborador com flag
 * `suspenso_preventivo=true` para reconciliação posterior com o Leaver formal
 * quando o CSV finalmente atualizar o status para inativo.
 *
 * Reversível via `revertSuspensaoPreventiva` enquanto o colaborador permanecer ativo.
 */
export async function suspendColaboradorPreventivo(
  colab: ColabRef,
  motivo: string,
  operador: OperadorRef,
): Promise<{ success: boolean; error?: string }> {
  if (!motivo || motivo.trim().length < 10) {
    return { success: false, error: "Justificativa obrigatória (mínimo 10 caracteres)." };
  }

  const sam = colab.sam_account_name || "";
  const identity = colab.email || sam;
  if (!identity) {
    return { success: false, error: "Colaborador sem e-mail/samAccountName — não há identidade para suspender." };
  }

  const requestedBy = `pre_leaver:${operador.email || "sistema"}`;
  const now = new Date().toISOString();

  // 1. Mark collaborator as preventively suspended
  const { error: updErr } = await supabase
    .from("colaboradores")
    .update({
      suspenso_preventivo: true,
      suspenso_em: now,
      suspenso_por: operador.email || operador.nome || "sistema",
      suspenso_motivo: motivo.trim(),
    } as any)
    .eq("id", colab.id);
  if (updErr) return { success: false, error: updErr.message };

  // 2. Disable AD on-prem account
  await supabase.from("iam_queue" as any).insert({
    action_type: "disable",
    payload_json: {
      samAccountName: sam,
      mail: colab.email || null,
      displayName: colab.nome,
      status: "disabled",
      motivo: "pre_leaver",
      justificativa: motivo.trim(),
    },
    requested_by: requestedBy,
    colaborador_id: colab.id,
    target_identity: sam || null,
    status: "pending",
  });

  // 3. Block sign-in in Entra ID (accountEnabled=false + revoke sessions)
  await supabase.from("iam_queue" as any).insert({
    action_type: "disable_entra",
    payload_json: {
      mail: colab.email || null,
      samAccountName: sam,
      displayName: colab.nome,
      motivo: "pre_leaver",
      justificativa: motivo.trim(),
      revokeSignInSessions: true,
    },
    requested_by: requestedBy,
    colaborador_id: colab.id,
    target_identity: identity,
    status: "pending",
  });

  // 4. JML event
  await createEventoJML({
    colaboradorId: colab.id,
    colaboradorNome: colab.nome,
    tipo: "pre_leaver",
    dadosAntes: { suspenso_preventivo: false },
    dadosDepois: {
      suspenso_preventivo: true,
      motivo: motivo.trim(),
      operador: operador.email || operador.nome,
      suspenso_em: now,
    },
  });

  // 5. Audit + alert
  await logAuditoria({
    acao: "suspender_preventivo",
    entidade: "colaboradores",
    entidade_id: colab.id,
    resumo: `Suspensão preventiva: ${colab.nome}`,
    operador: operador.email,
    detalhes: { motivo: motivo.trim(), identity },
  });

  await logAlerta({
    titulo: "Suspensão preventiva ativada",
    mensagem: `${colab.nome} teve os acessos suspensos preventivamente. Motivo: ${motivo.trim()}`,
    severidade: "critico",
    tipo: "pre_leaver_ativado",
    ref_tipo: "colaborador",
    ref_id: colab.id,
    ref_url: `/colaboradores/${colab.id}`,
  });

  // 6. Notify gestor (best-effort, reuses existing template)
  if (colab.gestor_id) {
    const { data: gestorData } = await supabase
      .from("colaboradores")
      .select("nome, email")
      .eq("id", colab.gestor_id)
      .single();
    if (gestorData?.email) {
      sendNotificationEmail("colaborador_desabilitado" as any, {
        destinatario_email: gestorData.email,
        colaborador_nome: colab.nome,
        status_anterior: "ativo",
        novo_status: "suspensão preventiva",
        operador: operador.nome || operador.email || "Sistema",
        colaborador_id: colab.id,
        justificativa: motivo.trim(),
      });
    }
  }

  triggerEntraProcessing();
  return { success: true };
}

/**
 * Reverte uma suspensão preventiva: reabilita conta no Entra ID + AD,
 * limpa flags e registra evento `pre_leaver_revertido`.
 */
export async function revertSuspensaoPreventiva(
  colab: ColabRef,
  motivo: string,
  operador: OperadorRef,
): Promise<{ success: boolean; error?: string }> {
  if (!motivo || motivo.trim().length < 10) {
    return { success: false, error: "Justificativa obrigatória (mínimo 10 caracteres)." };
  }

  const sam = colab.sam_account_name || "";
  const identity = colab.email || sam;
  if (!identity) {
    return { success: false, error: "Colaborador sem identidade." };
  }

  const requestedBy = `pre_leaver_revert:${operador.email || "sistema"}`;

  // 1. Clear flag
  const { error: updErr } = await supabase
    .from("colaboradores")
    .update({
      suspenso_preventivo: false,
      suspenso_em: null,
      suspenso_por: null,
      suspenso_motivo: null,
    } as any)
    .eq("id", colab.id);
  if (updErr) return { success: false, error: updErr.message };

  // 2. Re-enable AD on-prem
  await supabase.from("iam_queue" as any).insert({
    action_type: "update",
    payload_json: {
      samAccountName: sam,
      mail: colab.email || null,
      displayName: colab.nome,
      status: "enabled",
      motivo: "pre_leaver_revertido",
      justificativa: motivo.trim(),
    },
    requested_by: requestedBy,
    colaborador_id: colab.id,
    target_identity: sam || null,
    status: "pending",
  });

  // 3. Re-enable Entra ID
  await supabase.from("iam_queue" as any).insert({
    action_type: "enable_entra",
    payload_json: {
      mail: colab.email || null,
      samAccountName: sam,
      displayName: colab.nome,
      motivo: "pre_leaver_revertido",
      justificativa: motivo.trim(),
    },
    requested_by: requestedBy,
    colaborador_id: colab.id,
    target_identity: identity,
    status: "pending",
  });

  await createEventoJML({
    colaboradorId: colab.id,
    colaboradorNome: colab.nome,
    tipo: "pre_leaver_revertido",
    dadosAntes: { suspenso_preventivo: true },
    dadosDepois: { suspenso_preventivo: false, motivo: motivo.trim() },
  });

  await logAuditoria({
    acao: "reverter_suspensao_preventiva",
    entidade: "colaboradores",
    entidade_id: colab.id,
    resumo: `Suspensão preventiva revertida: ${colab.nome}`,
    operador: operador.email,
    detalhes: { motivo: motivo.trim() },
  });

  await logAlerta({
    titulo: "Suspensão preventiva revertida",
    mensagem: `${colab.nome} teve a suspensão preventiva revertida. Motivo: ${motivo.trim()}`,
    severidade: "aviso",
    tipo: "pre_leaver_revertido",
    ref_tipo: "colaborador",
    ref_id: colab.id,
    ref_url: `/colaboradores/${colab.id}`,
  });

  triggerEntraProcessing();
  return { success: true };
}
