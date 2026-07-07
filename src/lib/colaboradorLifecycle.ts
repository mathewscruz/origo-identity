import { supabase } from "@/integrations/supabase/client";
import { authedFetch } from "@/lib/authedFetch";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { provisionCargoAcessos } from "@/lib/provisionCargoAcessos";
import { createEventoJML } from "@/lib/createEventoJML";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";
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
  /** If true, skip the colaboradores.update({status}) — caller already did it */
  skipStatusUpdate?: boolean;
}

/**
 * Unified collaborator lifecycle handler.
 * Handles hard disable, soft disable, and reactivation consistently
 * from both ColaboradoresPage and ColaboradorDetalhePage.
 */
export async function handleStatusChange(params: StatusChangeParams): Promise<{ success: boolean; error?: string }> {
  const { colab, oldStatus, newStatus, operadorEmail, operadorNome } = params;
  const sam = colab.sam_account_name || "";
  const identity = colab.email || sam || "";

  const HARD_STATES = new Set(["inativo", "desligado"]);
  const isHardTransition = HARD_STATES.has(newStatus) && !HARD_STATES.has(oldStatus);
  const isSoftDeactivation = oldStatus === "ativo" && (newStatus === "ferias" || newStatus === "afastado");
  const isDeactivation = isHardTransition || isSoftDeactivation;

  // Check for active "manter_ativo" exception before hard deactivation (inclusive from ferias/afastado → inativo/desligado)
  if (isHardTransition) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeExcecoes } = await (supabase as any).from("excecoes")
      .select("id, justificativa, validade, solicitante")
      .eq("colaborador_id", colab.id)
      .eq("tipo_excecao", "manter_ativo")
      .eq("status", "aprovada")
      .gte("validade", today);
    if (activeExcecoes && activeExcecoes.length > 0) {
      const exc = activeExcecoes[0];
      return {
        success: false,
        error: `Existe uma exceção "Manter Ativo" aprovada até ${new Date(exc.validade).toLocaleDateString("pt-BR")} (Solicitante: ${exc.solicitante}). Remova ou aguarde a expiração da exceção para desativar este colaborador.`,
      };
    }
  }

  // Update status in database (skip if caller already did it)
  if (!params.skipStatusUpdate) {
    const { error: updateErr } = await supabase.from("colaboradores").update({ status: newStatus as any }).eq("id", colab.id);
    if (updateErr) return { success: false, error: updateErr.message };
  }

  // Audit log
  await logAuditoria({
    acao: "alterar_status_colaborador",
    entidade: "colaboradores",
    entidade_id: colab.id,
    resumo: `Status: ${oldStatus} → ${newStatus} — ${colab.nome}`,
    operador: operadorEmail,
  });

  // ─── MANUAL OVERRIDE: register approved exception so RH/SharePoint sync won't revert this change ──
  // newStatus === "ativo" → "manter_ativo" (bypass automatic deactivation)
  // any other manual status → "status_manual" (Override Manual de Status)
  try {
    const tipoExcecao = newStatus === "ativo" ? "manter_ativo" : "status_manual";
    const validade = new Date();
    validade.setFullYear(validade.getFullYear() + 1);
    const validadeStr = validade.toISOString().slice(0, 10);

    // Expire prior active status_manual overrides for this colab (keep history)
    await (supabase as any).from("excecoes")
      .update({ status: "expirada", data_decisao: new Date().toISOString() })
      .eq("colaborador_id", colab.id)
      .eq("tipo_excecao", "status_manual")
      .eq("status", "aprovada");

    await (supabase as any).from("excecoes").insert({
      solicitante: operadorNome || operadorEmail || "sistema",
      colaborador_nome: colab.nome,
      colaborador_id: colab.id,
      tipo_excecao: tipoExcecao,
      justificativa: `Override manual de status: ${oldStatus} → ${newStatus}. RH/SharePoint não deve sobrescrever até ${validadeStr}.`,
      status: "aprovada",
      aprovador: operadorNome || operadorEmail || "sistema",
      data_decisao: new Date().toISOString(),
      validade: validadeStr,
    });
  } catch (excErr) {
    console.error("[handleStatusChange] Falha ao registrar exceção de override manual:", excErr);
  }



  // ─── DEACTIVATION (any transition into inativo/desligado, or ativo → ferias/afastado) ─
  if (isDeactivation) {
    const isHardDisable = HARD_STATES.has(newStatus);

    // Reconcile with a prior preventive suspension (if any)
    const { data: colabRow } = await supabase
      .from("colaboradores")
      .select("suspenso_preventivo, suspenso_em")
      .eq("id", colab.id)
      .single();
    const wasPreSuspended = !!(colabRow as any)?.suspenso_preventivo;
    const suspensoEm = (colabRow as any)?.suspenso_em || null;
    const gapDias = wasPreSuspended && suspensoEm
      ? Math.max(0, Math.round((Date.now() - new Date(suspensoEm).getTime()) / 86400000))
      : null;

    await logAlerta({
      titulo: "Colaborador desabilitado",
      mensagem: wasPreSuspended
        ? `${colab.nome} foi formalmente desligado. Suspensão preventiva já estava ativa há ${gapDias} dia(s) — reconciliado.`
        : `${colab.nome} teve o status alterado para ${newStatus}`,
      severidade: wasPreSuspended ? "info" : "aviso",
      tipo: "colaborador_desabilitado",
      ref_url: `/colaboradores/${colab.id}`,
    });

    // Skip duplicate disable actions if already preventively suspended
    if (!wasPreSuspended) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "disable",
        payload_json: {
          samAccountName: sam,
          mail: colab.email || null,
          displayName: colab.nome,
          status: "disabled",
          status_anterior: oldStatus,
          status_novo: newStatus,
          changed_fields: ["status"],
          new_values: { status: "disabled" },
        },
        requested_by: operadorEmail || "sistema",
        colaborador_id: colab.id,
        target_identity: sam || null,
      });

      if (identity) {
        await supabase.from("iam_queue" as any).insert({
          action_type: "disable_entra",
          payload_json: { mail: colab.email || null, samAccountName: sam, displayName: colab.nome },
          requested_by: operadorEmail || "sistema",
          colaborador_id: colab.id,
          target_identity: identity,
        });
      }
    } else {
      // Clear the preventive flag — formal Leaver supersedes it
      await supabase
        .from("colaboradores")
        .update({
          suspenso_preventivo: false,
          suspenso_em: null,
          suspenso_por: null,
          suspenso_motivo: null,
        } as any)
        .eq("id", colab.id);
    }

    // Hard disable manual → mark to prevent CSV-driven reactivation
    if (isHardDisable) {
      await supabase
        .from("colaboradores")
        .update({
          desligado_manual: true,
          desligado_manual_em: new Date().toISOString(),
          desligado_manual_por: operadorEmail || "sistema",
        } as any)
        .eq("id", colab.id);
    }

    let activePerfilIds: string[] = [];
    const individualSnapshot: any[] = [];

    if (isHardDisable) {
      // 1. Get active perfil_atribuicoes BEFORE deactivating them (for snapshot)
      const { data: activeAtribuicoes } = await supabase
        .from("perfil_atribuicoes")
        .select("perfil_id")
        .eq("colaborador_id", colab.id)
        .eq("ativo", true);
      activePerfilIds = (activeAtribuicoes ?? []).map((a: any) => a.perfil_id).filter(Boolean);

      // 2. Deactivate ALL perfil_atribuicoes in the database
      await supabase.from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() } as any)
        .eq("colaborador_id", colab.id)
        .eq("ativo", true);

      // 3. Queue remove_* for profile-based resources
      if (activePerfilIds.length > 0 && identity) {
        const colabIdentity = {
          id: colab.id,
          nome: colab.nome,
          email: colab.email,
          sam_account_name: colab.sam_account_name,
        };
        await queueFullProfileActions([colabIdentity], activePerfilIds, "remove", { triggerImmediately: false });
      }

      // 4. Also remove individually assigned resources (both manual_individual AND entra_sync)
      const { data: individualItems } = await (supabase as any).from("iam_queue")
        .select("action_type, payload_json, target_identity, requested_by")
        .eq("colaborador_id", colab.id)
        .in("requested_by", ["manual_individual", "entra_sync"])
        .eq("status", "success")
        .in("action_type", ["assign_group", "assign_license", "assign_app"]);

      const reverseMap: Record<string, string> = {
        assign_group: "remove_group",
        assign_license: "remove_license",
        assign_app: "remove_app",
      };

      // Deduplicate by resource key to avoid duplicate removal requests
      const seenKeys = new Set<string>();
      for (const item of (individualItems ?? [])) {
        const p = item.payload_json;
        const key = item.action_type === "assign_group"
          ? `group:${p.groupId}`
          : item.action_type === "assign_license"
          ? `license:${p.skuId}`
          : `app:${p.appId}`;

        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        individualSnapshot.push({
          action_type: item.action_type,
          payload_json: item.payload_json,
          target_identity: item.target_identity,
          requested_by: item.requested_by,
        });

        await supabase.from("iam_queue" as any).insert({
          action_type: reverseMap[item.action_type],
          payload_json: item.payload_json,
          requested_by: "sistema_desativacao",
          colaborador_id: colab.id,
          target_identity: item.target_identity,
          status: "pending",
        });
      }
    }
    // Soft disable (férias/afastado): only disable login, preserve all resources

    // Notify gestor via email
    if (colab.gestor_id) {
      const { data: gestorData } = await supabase.from("colaboradores").select("nome, email").eq("id", colab.gestor_id).single();
      if (gestorData?.email) {
        sendNotificationEmail("colaborador_desabilitado", {
          destinatario_email: gestorData.email,
          colaborador_nome: colab.nome,
          status_anterior: oldStatus,
          novo_status: newStatus,
          operador: operadorNome || operadorEmail || "Sistema",
          colaborador_id: colab.id,
        });
      }
    }

    // Create JML leaver event with full snapshot
    await createEventoJML({
      colaboradorId: colab.id,
      colaboradorNome: colab.nome,
      tipo: "leaver",
      dadosAntes: {
        status: oldStatus,
        tipo_desativacao: isHardDisable ? "hard" : "soft",
        perfis: activePerfilIds,
        recursos_individuais: isHardDisable ? individualSnapshot : [],
        pre_suspensao_aplicada: wasPreSuspended,
        gap_dias: gapDias,
      },
      dadosDepois: { status: newStatus },
    });
  }

  // ─── REACTIVATION (anything → ativo) ───────────────────────────
  if (oldStatus !== "ativo" && newStatus === "ativo") {
    // Clear manual-disable flag (operator is consciously reactivating in the tool)
    await supabase
      .from("colaboradores")
      .update({
        desligado_manual: false,
        desligado_manual_em: null,
        desligado_manual_por: null,
      } as any)
      .eq("id", colab.id);

    // Enable accounts in AD + Entra
    await supabase.from("iam_queue" as any).insert({
      action_type: "update",
      payload_json: {
        samAccountName: sam,
        mail: colab.email || null,
        displayName: colab.nome,
        status: "enabled",
        status_anterior: oldStatus,
        status_novo: "ativo",
        changed_fields: ["status"],
        new_values: { status: "enabled" },
      },
      requested_by: operadorEmail || "sistema",
      colaborador_id: colab.id,
      target_identity: sam || null,
    });

    if (identity) {
      await supabase.from("iam_queue" as any).insert({
        action_type: "enable_entra",
        payload_json: { mail: colab.email || null, samAccountName: sam, displayName: colab.nome },
        requested_by: operadorEmail || "sistema",
        colaborador_id: colab.id,
        target_identity: identity,
      });
    }

    // Check if this was a hard disable (perfil_atribuicoes were revoked)
    const { data: existingActive } = await supabase
      .from("perfil_atribuicoes")
      .select("id")
      .eq("colaborador_id", colab.id)
      .eq("ativo", true)
      .limit(1);
    const hasActiveProfiles = (existingActive?.length ?? 0) > 0;

    if (!hasActiveProfiles && colab.cargo_id) {
      // Hard disable recovery: re-provision cargo-based profiles
      await provisionCargoAcessos(colab.id, colab.cargo_id, null);
    }
    // Soft disable: profiles are still active, no re-provisioning needed

    // Restore individually assigned resources from last hard leaver event
    const { data: lastLeaver } = await supabase
      .from("eventos_jml")
      .select("dados_antes")
      .eq("colaborador_id", colab.id)
      .eq("tipo", "leaver")
      .order("created_at", { ascending: false })
      .limit(1);

    const leaverData = lastLeaver?.[0]?.dados_antes as any;
    const wasHardDisable = leaverData?.tipo_desativacao === "hard";
    const savedIndividuals = wasHardDisable ? (leaverData?.recursos_individuais || []) : [];

    for (const item of savedIndividuals) {
      await supabase.from("iam_queue" as any).insert({
        action_type: item.action_type,
        payload_json: item.payload_json,
        requested_by: item.requested_by || "manual_individual",
        colaborador_id: colab.id,
        target_identity: item.target_identity,
        status: "pending",
      });
    }

    await createEventoJML({
      colaboradorId: colab.id,
      colaboradorNome: colab.nome,
      tipo: "joiner",
      dadosAntes: { status: oldStatus },
      dadosDepois: { status: newStatus, recursos_individuais_restaurados: savedIndividuals.length },
    });

    await logAlerta({
      titulo: "Colaborador reativado",
      mensagem: `${colab.nome} foi reativado`,
      severidade: "info",
      tipo: "colaborador_reativado",
      ref_url: `/colaboradores/${colab.id}`,
    });
  }

  triggerEntraProcessing();
  return { success: true };
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
      headers: {
        "Content-Type": "application/json",
      },
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
