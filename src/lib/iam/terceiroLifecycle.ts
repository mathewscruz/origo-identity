/**
 * Lifecycle helpers for `terceiros` (third-party identities).
 *
 * Encapsulates the desligar / reativar flows so TerceiroDetalhePage stays a UI
 * shell. Each function is self-contained: it updates `terceiros`, snapshots state,
 * enqueues iam_queue actions, writes the JML event, and emits audit + alerts.
 *
 * All side effects are awaited; the caller only needs to trigger queue processing
 * and invalidate query caches.
 */
import { supabase } from "@/integrations/supabase/client";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { createEventoJML } from "@/lib/createEventoJML";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";

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
}

/**
 * Hard offboarding: revoke profiles, mirror-remove individual resources,
 * disable AD + Entra, register JML leaver with snapshot for future reactivation.
 */
export async function desligarTerceiro(
  t: TerceiroIdentity,
  operator: OperatorContext,
  atribuicoes: Array<{ perfil_id: string }>,
): Promise<LifecycleResult> {
  try {
    // Active "manter_ativo" exception blocks deactivation
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeExcecoes } = await (supabase as any)
      .from("excecoes")
      .select("id, justificativa, validade, solicitante")
      .eq("colaborador_id", t.id)
      .eq("tipo_excecao", "manter_ativo")
      .eq("status", "aprovada")
      .gte("validade", today);
    if (activeExcecoes && activeExcecoes.length > 0) {
      const exc = activeExcecoes[0];
      return {
        success: false,
        error: `Existe uma exceção "Manter Ativo" aprovada até ${new Date(exc.validade).toLocaleDateString("pt-BR")} (Solicitante: ${exc.solicitante}).`,
      };
    }

    await supabase.from("terceiros").update({ ativo: false }).eq("id", t.id);

    const perfilIds = atribuicoes.map((a) => a.perfil_id).filter(Boolean);

    if (perfilIds.length > 0) {
      await supabase
        .from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() })
        .eq("terceiro_id", t.id)
        .eq("ativo", true);

      if (t.email || t.sam_account_name) {
        await queueFullProfileActions([t], perfilIds, "remove", { triggerImmediately: false });
      }
    }

    // Snapshot + mirror-remove individual resources
    const { data: individualItems } = await (supabase as any)
      .from("iam_queue")
      .select("action_type, payload_json, target_identity")
      .eq("colaborador_id", t.id)
      .eq("requested_by", "manual_individual")
      .eq("status", "success")
      .in("action_type", ["assign_group", "assign_license", "assign_app"]);

    const individualSnapshot: any[] = [];
    const reverseMap: Record<string, string> = {
      assign_group: "remove_group",
      assign_license: "remove_license",
      assign_app: "remove_app",
    };
    for (const item of individualItems ?? []) {
      individualSnapshot.push({
        action_type: item.action_type,
        payload_json: item.payload_json,
        target_identity: item.target_identity,
      });
      await supabase.from("iam_queue" as any).insert({
        action_type: reverseMap[item.action_type],
        payload_json: item.payload_json,
        requested_by: "sistema_desativacao",
        colaborador_id: t.id,
        target_identity: item.target_identity,
        status: "pending",
      });
    }

    // Disable AD + Entra
    if (t.sam_account_name) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "disable",
        payload_json: {
          samAccountName: t.sam_account_name,
          mail: t.email,
          displayName: t.nome,
          status: "disabled",
        },
        requested_by: operator.email || "sistema",
        colaborador_id: t.id,
        target_identity: t.sam_account_name,
        status: "pending",
      });
    }
    const entraIdentity = t.email || t.sam_account_name;
    if (entraIdentity) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "disable_entra",
        payload_json: { mail: t.email, samAccountName: t.sam_account_name, displayName: t.nome },
        requested_by: operator.email || "sistema",
        colaborador_id: t.id,
        target_identity: entraIdentity,
        status: "pending",
      });
    }

    await createEventoJML({
      colaboradorId: t.id,
      colaboradorNome: t.nome,
      tipo: "leaver",
      dadosAntes: { status: "ativo", perfis: perfilIds, recursos_individuais: individualSnapshot },
      dadosDepois: { status: "inativo", motivo: "desligamento_terceiro" },
    });

    await logAuditoria({
      acao: "desligar_terceiro",
      entidade: "terceiros",
      entidade_id: t.id,
      resumo: `Terceiro ${t.nome} desligado — ${perfilIds.length} perfis revogados`,
      operador: operator.email,
    });
    await logAlerta({
      titulo: "Terceiro desligado",
      mensagem: `${t.nome}${t.empresa_terceira ? ` (${t.empresa_terceira})` : ""} foi desligado. ${perfilIds.length} perfis revogados.`,
      severidade: "aviso",
      tipo: "terceiro_desligado",
      ref_url: `/terceiros/${t.id}`,
    });

    return { success: true, perfisRevogados: perfilIds.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Restore a previously disabled terceiro: re-enable AD/Entra, re-attach saved
 * perfis from the last leaver snapshot, restore individual resources, log
 * joiner event + alert.
 */
export async function reativarTerceiro(
  t: TerceiroIdentity,
  operator: OperatorContext,
): Promise<LifecycleResult> {
  try {
    await supabase.from("terceiros").update({ ativo: true }).eq("id", t.id);

    if (t.sam_account_name) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "update",
        payload_json: {
          samAccountName: t.sam_account_name,
          mail: t.email,
          displayName: t.nome,
          status: "enabled",
        },
        requested_by: operator.email || "sistema",
        colaborador_id: t.id,
        target_identity: t.sam_account_name,
        status: "pending",
      });
    }
    const entraIdentity = t.email || t.sam_account_name;
    if (entraIdentity) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "enable_entra",
        payload_json: { mail: t.email, samAccountName: t.sam_account_name, displayName: t.nome },
        requested_by: operator.email || "sistema",
        colaborador_id: t.id,
        target_identity: entraIdentity,
        status: "pending",
      });
    }

    const { data: lastLeaver } = await supabase
      .from("eventos_jml")
      .select("dados_antes")
      .eq("colaborador_id", t.id)
      .eq("tipo", "leaver")
      .order("created_at", { ascending: false })
      .limit(1);

    const dadosAntes = (lastLeaver?.[0]?.dados_antes ?? {}) as any;
    const savedPerfis: string[] = dadosAntes.perfis ?? [];
    const savedIndividuals: any[] = dadosAntes.recursos_individuais ?? [];

    if (savedPerfis.length > 0 && (t.email || t.sam_account_name)) {
      for (const perfilId of savedPerfis) {
        await supabase.from("perfil_atribuicoes").insert({
          perfil_id: perfilId,
          terceiro_id: t.id,
          origem: "manual",
          ativo: true,
        });
      }
      await queueFullProfileActions([t], savedPerfis, "assign", { triggerImmediately: false });
    }

    for (const item of savedIndividuals) {
      await supabase.from("iam_queue" as any).insert({
        action_type: item.action_type,
        payload_json: item.payload_json,
        requested_by: "manual_individual",
        colaborador_id: t.id,
        target_identity: item.target_identity,
        status: "pending",
      });
    }

    await createEventoJML({
      colaboradorId: t.id,
      colaboradorNome: t.nome,
      tipo: "joiner",
      dadosAntes: { status: "inativo" },
      dadosDepois: {
        status: "ativo",
        perfis_restaurados: savedPerfis.length,
        recursos_individuais_restaurados: savedIndividuals.length,
      },
    });

    await logAuditoria({
      acao: "reativar_terceiro",
      entidade: "terceiros",
      entidade_id: t.id,
      resumo: `Terceiro ${t.nome} reativado — ${savedPerfis.length} perfis e ${savedIndividuals.length} recursos individuais restaurados`,
      operador: operator.email,
    });
    await logAlerta({
      titulo: "Terceiro reativado",
      mensagem: `${t.nome} foi reativado com ${savedPerfis.length} perfis e ${savedIndividuals.length} recursos individuais.`,
      severidade: "info",
      tipo: "terceiro_reativado",
      ref_url: `/terceiros/${t.id}`,
    });

    return { success: true, perfisRestaurados: savedPerfis.length, individuaisRestaurados: savedIndividuals.length };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
