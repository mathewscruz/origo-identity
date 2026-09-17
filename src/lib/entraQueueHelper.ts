import { supabase } from "@/integrations/supabase/client";

/**
 * Geração de itens da fila IAM — SEMPRE via RPCs do banco, que calculam o acesso
 * efetivo (perfis ativos + concessões individuais): uma remoção só é enfileirada
 * quando nenhum outro caminho ainda concede o recurso, e itens abertos duplicados
 * são ignorados (índice único por identidade × ação × recurso).
 */

export interface ColabIdentity {
  id: string;
  nome: string;
  email: string | null;
  sam_account_name: string | null;
  /** padrão: colaborador */
  tipo?: "colaborador" | "terceiro";
}

export interface SharepointItem { siteId: string; pastaId?: string | null; permissao: string }

export interface ResourceDiff {
  addedGrupoIds: string[];
  removedGrupoIds: string[];
  addedLicencaIds: string[];
  removedLicencaIds: string[];
  addedAppIds: string[];
  removedAppIds: string[];
  addedSharepointItems?: SharepointItem[];
  removedSharepointItems?: SharepointItem[];
}

export interface QueueOptions {
  requestedBy?: string;
  /** 'pending' (padrão; o gate global pode converter em waiting_approval) ou 'waiting_approval' */
  status?: "pending" | "waiting_approval";
  motivo?: string;
  /** perfil cuja composição está sendo editada — não conta como "ainda concede" nas remoções */
  perfilId?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function idsOf(identity: ColabIdentity) {
  return identity.tipo === "terceiro"
    ? { p_colaborador_id: null as string | null, p_terceiro_id: identity.id as string | null }
    : { p_colaborador_id: identity.id as string | null, p_terceiro_id: null as string | null };
}

function toResourceList(grupos: string[], licencas: string[], apps: string[], sharepoint: SharepointItem[]) {
  return [
    ...grupos.map((id) => ({ tipo: "grupo", id })),
    ...licencas.map((id) => ({ tipo: "licenca", id })),
    ...apps.map((id) => ({ tipo: "app", id })),
    ...sharepoint.map((sp) => ({ tipo: "sharepoint", id: sp.siteId, pasta_id: sp.pastaId ?? null, permissao: sp.permissao })),
  ];
}

// ─── Core: diff de recursos → fila ───────────────────────────────────────────

/**
 * Enfileira um diff de grupos/licenças/apps/SharePoint para um conjunto de identidades.
 * Remoções respeitam o acesso efetivo (outros perfis ativos e concessões individuais).
 */
export async function generateEntraQueueForDiff(
  identities: ColabIdentity[],
  diff: ResourceDiff,
  opts?: QueueOptions,
): Promise<number> {
  if (identities.length === 0) return 0;
  const added = toResourceList(diff.addedGrupoIds, diff.addedLicencaIds, diff.addedAppIds, diff.addedSharepointItems ?? []);
  const removed = toResourceList(diff.removedGrupoIds, diff.removedLicencaIds, diff.removedAppIds, diff.removedSharepointItems ?? []);
  if (added.length + removed.length === 0) return 0;

  let total = 0;
  for (const identity of identities) {
    const { data, error } = await supabase.rpc("iam_enqueue_resource_diff", {
      ...idsOf(identity),
      p_added: added,
      p_removed: removed,
      p_requested_by: opts?.requestedBy ?? "sistema",
      p_status: opts?.status ?? "pending",
      p_motivo: opts?.motivo ?? null,
      p_exclude_perfil_ids: opts?.perfilId ? [opts.perfilId] : [],
      p_check_individual: true,
    });
    if (error) { console.error("[entraQueueHelper] iam_enqueue_resource_diff:", error.message); continue; }
    total += Number(data ?? 0);
  }
  return total;
}

// ─── Discover affected collaborators ──────────────────────────────────────────

export async function findAffectedCollaborators(perfilId: string): Promise<ColabIdentity[]> {
  const { data: directAssignments } = await supabase
    .from("perfil_atribuicoes")
    .select("colaborador_id, terceiro_id")
    .eq("perfil_id", perfilId)
    .eq("ativo", true);

  const directIds = (directAssignments ?? []).map((a: any) => a.colaborador_id).filter(Boolean) as string[];
  const terceiroIds = (directAssignments ?? []).map((a: any) => a.terceiro_id).filter(Boolean) as string[];

  const { data: cargoPerfis } = await (supabase as any).from("cargo_perfis").select("cargo_id").eq("perfil_id", perfilId);
  const cargoIds = (cargoPerfis ?? []).map((cp: any) => cp.cargo_id).filter(Boolean) as string[];
  let cargoColabIds: string[] = [];
  if (cargoIds.length > 0) {
    const { data: cargoColabs } = await supabase.from("colaboradores").select("id").in("cargo_id", cargoIds).in("status", ["ativo", "ferias", "afastado"]);
    cargoColabIds = (cargoColabs ?? []).map((c: any) => c.id);
  }

  const out: ColabIdentity[] = [];
  const allIds = [...new Set([...directIds, ...cargoColabIds])];
  if (allIds.length > 0) {
    const { data: colabs } = await supabase.from("colaboradores").select("id, nome, email, sam_account_name").in("id", allIds);
    for (const c of colabs ?? []) out.push({ id: c.id, nome: c.nome, email: c.email, sam_account_name: c.sam_account_name, tipo: "colaborador" });
  }
  if (terceiroIds.length > 0) {
    const { data: tercs } = await (supabase as any).from("terceiros").select("id, nome, email, sam_account_name").in("id", [...new Set(terceiroIds)]);
    for (const t of tercs ?? []) out.push({ id: t.id, nome: t.nome, email: t.email, sam_account_name: t.sam_account_name ?? null, tipo: "terceiro" });
  }
  return out;
}

// ─── High-level: assign/remove de perfis inteiros ─────────────────────────────

export async function queueFullProfileActions(
  identities: ColabIdentity[],
  perfilIds: string[],
  mode: "assign" | "remove",
  opts?: QueueOptions,
): Promise<number> {
  if (identities.length === 0 || perfilIds.length === 0) return 0;
  let total = 0;
  for (const identity of identities) {
    const { data, error } = await supabase.rpc("iam_enqueue_profile_actions", {
      ...idsOf(identity),
      p_perfil_ids: perfilIds,
      p_mode: mode,
      p_requested_by: opts?.requestedBy ?? "sistema",
      p_status: opts?.status ?? "pending",
      p_motivo: opts?.motivo ?? null,
    });
    if (error) { console.error("[entraQueueHelper] iam_enqueue_profile_actions:", error.message); continue; }
    total += Number(data ?? 0);
  }
  return total;
}

// ─── High-level: composição de um cargo mudou ─────────────────────────────────

/**
 * Cargo ganhou/perdeu perfis: materializa/revoga perfil_atribuicoes dos colaboradores
 * do cargo e enfileira o delta. Remoções seguem `mover_remocao_modo`
 * (aprovacao = waiting_approval, imediato = pending, nenhum = não remove).
 */
export async function reprovisionCargoCollaborators(
  cargoId: string,
  addedPerfilIds: string[],
  removedPerfilIds: string[],
  operador?: string | null,
): Promise<{ queued: number; materialized: number; revoked: number }> {
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, nome, email, sam_account_name")
    .eq("cargo_id", cargoId)
    .in("status", ["ativo", "ferias", "afastado"]);
  const active = (colabs ?? []) as ColabIdentity[];
  if (active.length === 0) return { queued: 0, materialized: 0, revoked: 0 };

  const { data: modoParam } = await supabase.rpc("iam_param", { p_chave: "mover_remocao_modo", p_default: "aprovacao" });
  const modo = String(modoParam ?? "aprovacao");
  const requestedBy = operador ?? "cargo_reprovisionamento";

  let materialized = 0, revoked = 0, queued = 0;
  for (const c of active) {
    if (addedPerfilIds.length > 0) {
      const { data: existing } = await supabase.from("perfil_atribuicoes").select("perfil_id").eq("colaborador_id", c.id).eq("ativo", true).in("perfil_id", addedPerfilIds);
      const has = new Set((existing ?? []).map((e: any) => e.perfil_id));
      const inserts = addedPerfilIds.filter((p) => !has.has(p)).map((perfil_id) => ({ perfil_id, colaborador_id: c.id, origem: "cargo", ativo: true }));
      if (inserts.length > 0) {
        const { data: ins } = await supabase.from("perfil_atribuicoes").insert(inserts).select("id");
        materialized += ins?.length || 0;
        queued += await queueFullProfileActions([c], inserts.map((i) => i.perfil_id), "assign", { requestedBy, motivo: "cargo_reprovisionamento" });
      }
    }
    if (removedPerfilIds.length > 0) {
      const { data: rev } = await supabase
        .from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() })
        .eq("colaborador_id", c.id).eq("origem", "cargo").eq("ativo", true).in("perfil_id", removedPerfilIds)
        .select("perfil_id");
      revoked += rev?.length || 0;
      if ((rev?.length || 0) > 0 && modo !== "nenhum") {
        queued += await queueFullProfileActions([c], rev!.map((r: any) => r.perfil_id), "remove", { requestedBy, motivo: "cargo_reprovisionamento",
          status: modo === "imediato" ? "pending" : "waiting_approval",
        });
      }
    }
  }
  return { queued, materialized, revoked };
}
