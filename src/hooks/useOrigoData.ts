import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hooks de leitura. Convenção: o primeiro elemento da queryKey começa com o nome
 * da tabela/entidade — é assim que useRealtimeSync invalida o cache quando o
 * banco muda (ver TABLE_KEY_PREFIXES). Nenhuma tela usa polling para números.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function fetchAll(table: string, select: string, orderCol: string, ascending = true, cap = Infinity): Promise<Row[]> {
  const PAGE = 1000;
  const all: Row[] = [];
  let from = 0;
  while (all.length < cap) {
    const { data, error } = await (supabase as Row)
      .from(table)
      .select(select)
      .order(orderCol, { ascending })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const REFETCH_OPTS = {
  // Realtime (useRealtimeSync) invalida o cache quando os dados mudam no banco.
  // O refetch ao focar a janela é a rede de segurança para eventos perdidos.
  refetchOnWindowFocus: true,
  staleTime: 60_000,
  gcTime: 30 * 60_000,
  refetchInterval: false as const,
  placeholderData: keepPreviousData,
};

// ─── Cadastros base ───────────────────────────────────────────────────────────

export function useEmpresas() {
  return useQuery({ queryKey: ["empresas"], queryFn: () => fetchAll("empresas", "*", "nome"), ...REFETCH_OPTS });
}

export function useLocalidades() {
  return useQuery({ queryKey: ["localidades"], queryFn: () => fetchAll("localidades", "*, empresas(nome)", "nome"), ...REFETCH_OPTS });
}

export function useAreas() {
  return useQuery({ queryKey: ["areas"], queryFn: () => fetchAll("areas", "*, empresas(nome)", "nome"), ...REFETCH_OPTS });
}

export function useCargos() {
  return useQuery({ queryKey: ["cargos"], queryFn: () => fetchAll("cargos", "*, areas(nome)", "nome"), ...REFETCH_OPTS });
}

export function useParametros() {
  return useQuery({ queryKey: ["parametros"], queryFn: () => fetchAll("parametros", "*", "chave"), ...REFETCH_OPTS });
}

/** Valor de um parâmetro (string) com default. */
export function useParametro(chave: string, fallback = "") {
  const { data } = useParametros();
  const row = (data ?? []).find((p: Row) => p.chave === chave);
  return row?.valor ?? fallback;
}

// ─── Identidades ──────────────────────────────────────────────────────────────

export function useColaboradores() {
  return useQuery({
    queryKey: ["colaboradores"],
    queryFn: () => fetchAll("colaboradores", "*, cargos(nome), areas(nome), empresas(nome), localidades(nome)", "nome"),
    ...REFETCH_OPTS,
  });
}

export function useColaborador(id: string | undefined) {
  return useQuery({
    queryKey: ["colaborador", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select("*, cargos(nome), areas(nome), empresas(nome), localidades(nome)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      if (data?.gestor_id) {
        const { data: gestorData } = await supabase.from("colaboradores").select("nome").eq("id", data.gestor_id).single();
        (data as Row).gestor = gestorData || null;
      }
      return data;
    },
    ...REFETCH_OPTS,
  });
}

export function useTerceiros() {
  return useQuery({ queryKey: ["terceiros"], queryFn: () => fetchAll("terceiros", "*", "nome"), ...REFETCH_OPTS });
}

export function useTerceiro(id: string | undefined) {
  return useQuery({
    queryKey: ["terceiro", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("terceiros").select("*").eq("id", id!).single();
      if (error) throw error;
      const respId = (data as Row)?.responsavel_colaborador_id;
      if (respId) {
        const { data: resp } = await supabase.from("colaboradores").select("id, nome, email").eq("id", respId).single();
        (data as Row).responsavel_colaborador = resp || null;
      }
      return data;
    },
    ...REFETCH_OPTS,
  });
}

/** Acesso efetivo (perfis ativos + concessões individuais) de uma identidade — RPC iam_effective_access. */
export function useEffectiveAccess(colaboradorId?: string, terceiroId?: string) {
  return useQuery({
    queryKey: ["effective_access", colaboradorId ?? null, terceiroId ?? null],
    enabled: !!(colaboradorId || terceiroId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("iam_effective_access", { p_colaborador_id: colaboradorId ?? null, p_terceiro_id: terceiroId ?? null });
      if (error) throw error;
      return (data ?? []) as { origem: string; perfil_id: string | null; tipo: string; resource_key: string; payload: Row }[];
    },
    ...REFETCH_OPTS,
  });
}

// ─── Catálogo / governança ────────────────────────────────────────────────────

export function useAplicacoes() {
  return useQuery({ queryKey: ["aplicacoes"], queryFn: () => fetchAll("aplicacoes", "*", "nome"), ...REFETCH_OPTS });
}

export function usePerfisAcesso() {
  return useQuery({ queryKey: ["perfis_acesso"], queryFn: () => fetchAll("perfis_acesso", "*, perfil_aplicacoes(aplicacao_id, aplicacoes(nome))", "nome"), ...REFETCH_OPTS });
}

export function usePerfilAcesso(id: string | undefined) {
  return useQuery({
    queryKey: ["perfil_acesso", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("perfis_acesso").select("*").eq("id", id!).single(); if (error) throw error; return data; },
    ...REFETCH_OPTS,
  });
}

export function usePerfilAtribuicoes(perfilId?: string, colaboradorId?: string) {
  return useQuery({
    queryKey: ["perfil_atribuicoes", perfilId ?? null, colaboradorId ?? null],
    queryFn: async () => {
      let q = supabase.from("perfil_atribuicoes").select("*, perfis_acesso(nome, perfil_aplicacoes(aplicacao_id, aplicacoes(nome))), colaboradores(nome, cargos(nome), areas(nome))").eq("ativo", true);
      if (perfilId) q = q.eq("perfil_id", perfilId);
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    ...REFETCH_OPTS,
  });
}

export function useEventosJML() {
  return useQuery({ queryKey: ["eventos_jml"], queryFn: () => fetchAll("eventos_jml", "*", "created_at", false, 5000), ...REFETCH_OPTS });
}

export function useEventoJML(id: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("eventos_jml").select("*").eq("id", id!).single(); if (error) throw error; return data; },
    ...REFETCH_OPTS,
  });
}

export function useExcecoes() {
  return useQuery({ queryKey: ["excecoes"], queryFn: () => fetchAll("excecoes", "*, perfis_acesso(nome)", "created_at", false), ...REFETCH_OPTS });
}

export function useRevisoes() {
  return useQuery({ queryKey: ["revisoes"], queryFn: () => fetchAll("revisoes", "*", "created_at", false), ...REFETCH_OPTS });
}

export function useRevisao(id: string | undefined) {
  return useQuery({
    queryKey: ["revisao", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("revisoes").select("*").eq("id", id!).single(); if (error) throw error; return data; },
    ...REFETCH_OPTS,
  });
}

export function useRevisaoItens(revisaoId: string | undefined) {
  return useQuery({
    queryKey: ["revisao_itens", revisaoId], enabled: !!revisaoId,
    queryFn: async () => { const { data, error } = await supabase.from("revisao_itens").select("*").eq("revisao_id", revisaoId!); if (error) throw error; return data; },
    ...REFETCH_OPTS,
  });
}

export function useLicencas() {
  return useQuery({ queryKey: ["licencas"], queryFn: () => fetchAll("licencas", "*, aplicacoes(nome)", "nome"), ...REFETCH_OPTS });
}

export function useEntraLicencas() {
  return useQuery({ queryKey: ["entra_licencas"], queryFn: () => fetchAll("entra_licencas", "*", "nome"), ...REFETCH_OPTS });
}

/** Uso real por licença externa, calculado a partir das atribuições com sucesso na fila. */
export function useLicencasExternasUso() {
  return useQuery({
    queryKey: ["licencas_externas_uso"],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("licencas_externas_uso").select("licenca_id, em_uso_calc");
      if (error) throw error;
      return (data ?? []) as { licenca_id: string; em_uso_calc: number }[];
    },
    ...REFETCH_OPTS,
  });
}

export function useEntraGrupos() {
  return useQuery({ queryKey: ["entra_grupos"], queryFn: () => fetchAll("entra_grupos", "*", "nome"), ...REFETCH_OPTS });
}

export function useSharepointSites() {
  return useQuery({ queryKey: ["sharepoint_sites"], queryFn: () => fetchAll("sharepoint_sites", "*", "nome"), ...REFETCH_OPTS });
}

export function useAllSharepointPastas() {
  return useQuery({ queryKey: ["sharepoint_pastas_all"], queryFn: () => fetchAll("sharepoint_pastas", "*", "nome"), ...REFETCH_OPTS });
}

export function usePerfilSharepoint(perfilId?: string) {
  return useQuery({
    queryKey: ["perfil_sharepoint", perfilId],
    enabled: !!perfilId,
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("perfil_sharepoint").select("*, sharepoint_sites(nome, url)").eq("perfil_id", perfilId!);
      if (error) throw error;
      return data ?? [];
    },
    ...REFETCH_OPTS,
  });
}

// ─── Auditoria / alertas ──────────────────────────────────────────────────────

export interface AuditoriaPageParams { page: number; pageSize: number; search?: string; entidade?: string; operador?: string }

/** Auditoria paginada no servidor (a tabela cresce sem limite). */
export function useAuditoriaPage({ page, pageSize, search, entidade, operador }: AuditoriaPageParams) {
  return useQuery({
    queryKey: ["auditoria_page", page, pageSize, search ?? "", entidade ?? "", operador ?? ""],
    queryFn: async () => {
      let q = (supabase as Row).from("auditoria").select("*", { count: "exact" }).order("timestamp", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (entidade) q = q.eq("entidade", entidade);
      if (operador) q = q.eq("operador", operador);
      if (search) {
        const safe = search.replace(/[%,()]/g, " ");
        q = q.or(`acao.ilike.%${safe}%,resumo.ilike.%${safe}%,operador.ilike.%${safe}%,entidade_id.ilike.%${safe}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], total: count ?? 0 };
    },
    ...REFETCH_OPTS,
  });
}

export function useAuditoriaFiltros() {
  return useQuery({
    queryKey: ["auditoria_filtros"],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("auditoria").select("entidade, operador").order("timestamp", { ascending: false }).limit(2000);
      if (error) throw error;
      const entidades = Array.from(new Set((data ?? []).map((r: Row) => r.entidade).filter(Boolean))).sort() as string[];
      const operadores = Array.from(new Set((data ?? []).map((r: Row) => r.operador).filter(Boolean))).sort() as string[];
      return { entidades, operadores };
    },
    ...REFETCH_OPTS,
  });
}

export function useAlertas() {
  return useQuery({ queryKey: ["alertas"], queryFn: () => fetchAll("alertas", "*", "data", false, 3000), ...REFETCH_OPTS });
}

// ─── Fila / execução ──────────────────────────────────────────────────────────

export interface QueueStats {
  pending: number; waiting_approval: number; processing: number; failed: number;
  success_7d: number; cancelled_7d: number; total: number; oldest_pending: string | null; retry_scheduled: number;
}

export function useQueueStats() {
  return useQuery({
    queryKey: ["iam_queue_stats"],
    queryFn: async () => { const { data, error } = await supabase.rpc("iam_queue_stats"); if (error) throw error; return data as unknown as QueueStats; },
    ...REFETCH_OPTS,
  });
}

export interface QueuePageParams {
  page: number; pageSize: number; status?: string[]; actionType?: string; search?: string; requestedBy?: string;
  colaboradorId?: string; terceiroId?: string;
}

/** Fila paginada no servidor com filtros. */
export function useQueuePage(p: QueuePageParams) {
  return useQuery({
    queryKey: ["iam_queue_page", p.page, p.pageSize, (p.status ?? []).join(","), p.actionType ?? "", p.search ?? "", p.requestedBy ?? "", p.colaboradorId ?? "", p.terceiroId ?? ""],
    queryFn: async () => {
      let q = (supabase as Row).from("iam_queue").select("*", { count: "exact" }).order("created_at", { ascending: false })
        .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1);
      if (p.status?.length) q = q.in("status", p.status);
      if (p.actionType) q = q.eq("action_type", p.actionType);
      if (p.requestedBy) q = q.eq("requested_by", p.requestedBy);
      if (p.colaboradorId) q = q.eq("colaborador_id", p.colaboradorId);
      if (p.terceiroId) q = q.eq("terceiro_id", p.terceiroId);
      if (p.search) {
        const safe = p.search.replace(/[%,()]/g, " ");
        q = q.or(`target_identity.ilike.%${safe}%,payload_json->>displayName.ilike.%${safe}%,payload_json->>mail.ilike.%${safe}%,payload_json->>samAccountName.ilike.%${safe}%,correlation_id.ilike.%${safe}%,requested_by.ilike.%${safe}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], total: count ?? 0 };
    },
    ...REFETCH_OPTS,
  });
}

export function useQueueDistinctActions(statusFilter: string[]) {
  return useQuery({
    queryKey: ["iam_queue_filters", statusFilter.join(",")],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).rpc("iam_queue_distinct_actions_origins", { status_filter: statusFilter });
      if (error) throw error;
      const actions = Array.from(new Set((data || []).map((d: Row) => d.action_type).filter(Boolean))).sort() as string[];
      const origins = Array.from(new Set((data || []).map((d: Row) => d.requested_by).filter(Boolean))).sort() as string[];
      return { actions, origins };
    },
    ...REFETCH_OPTS,
  });
}

export interface AgentStatus {
  owner: string; last_seen_at: string; last_claim_at: string | null; last_result_at: string | null; last_result: string | null;
  version: string | null; host: string | null; execute_mode: boolean | null; details: Row;
}

export function useAgentStatus() {
  return useQuery({
    queryKey: ["iam_agent_status"],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("iam_agent_status").select("*").order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentStatus[];
    },
    ...REFETCH_OPTS,
  });
}

/** Último job de sincronização de um tipo (csv_colab, reconcile_identities, daily_cycle). */
export function useSyncJob(tipo: string) {
  return useQuery({
    queryKey: ["sync_jobs", tipo],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("sync_jobs").select("*").eq("tipo", tipo).order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as Row | null;
    },
    ...REFETCH_OPTS,
    // enquanto roda, a função grava progresso a cada fase — realtime cobre; polling curto só como reforço
    refetchInterval: (query: Row) => (query.state.data?.status === "running" ? 3000 : false),
  });
}


export function useColabQuarentena() {
  return useQuery({
    queryKey: ["colab_quarentena"],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("colab_quarentena").select("*").eq("status", "pendente").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    ...REFETCH_OPTS,
  });
}

/** Chave de recurso de um item da fila (mesma convenção do banco: iam_queue_resource_key). */
export function queueResourceKey(row: Row): string {
  if (row.resource_key) return row.resource_key as string;
  const p = row.payload_json || {};
  const at = row.action_type as string;
  if (at.includes("group")) return `grupo:${p.groupId || ""}`;
  if (at.includes("license")) return `licenca:${p.skuId || ""}`;
  if (p.resourceType === "sharepoint" || at.includes("sharepoint")) return `sharepoint:${p.siteId || ""}:${p.driveItemId || ""}:${p.permission || "leitura"}`;
  if (at.includes("app")) return `app:${p.appId || ""}`;
  return `${at}:${row.id}`;
}

/**
 * Concessões individuais (manual ou importadas do Entra) de uma identidade, incluindo
 * as ainda em andamento na fila. O estado "vigente" segue a mesma regra do banco
 * (iam_individual_resources): último assign_* com sucesso sem remove_* com sucesso depois.
 */
export function useColabIndividualQueue(colaboradorId: string | undefined, terceiroId?: string) {
  return useQuery({
    queryKey: ["colab_individual_queue", colaboradorId ?? null, terceiroId ?? null],
    enabled: !!(colaboradorId || terceiroId),
    queryFn: async () => {
      let q = (supabase as Row).from("iam_queue").select("*")
        .in("action_type", ["assign_group", "assign_license", "assign_app", "assign_sharepoint", "remove_group", "remove_license", "remove_app", "remove_sharepoint"])
        .order("created_at", { ascending: true });
      q = colaboradorId ? q.eq("colaborador_id", colaboradorId) : q.eq("terceiro_id", terceiroId!);
      const { data, error } = await q;
      if (error) throw error;
      const latestState = new Map<string, Row>();
      const latestManualAssign = new Map<string, Row>();
      for (const row of (data ?? []) as Row[]) {
        const key = queueResourceKey(row);
        const isRemove = row.action_type.startsWith("remove_");
        if (isRemove && row.status !== "success") continue; // tentativa de remoção ainda não efetivada não esconde o acesso
        if (["cancelled", "rejected"].includes(row.status)) continue;
        if (!isRemove && row.status === "failed") continue;
        latestState.set(key, { ...row, resource_key: key });
        if (row.requested_by === "manual_individual" && !isRemove && row.status === "success") latestManualAssign.set(key, { ...row, resource_key: key });
        if (isRemove) latestManualAssign.delete(key);
      }
      const out: Row[] = [];
      for (const [key, current] of latestState) {
        if (!current.action_type.startsWith("assign_")) continue;
        if (!["manual_individual", "entra_sync"].includes(current.requested_by) && !latestManualAssign.has(key)) continue; // concessões de perfil ficam na tabela de perfis
        out.push(latestManualAssign.get(key) ?? current);
      }
      return out;
    },
    ...REFETCH_OPTS,
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard_metrics"],
    queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_metrics"); if (error) throw error; return data as Row; },
    ...REFETCH_OPTS,
    staleTime: 15_000,
  });
}

export interface DashboardSeriesPoint {
  dia: string; concessoes: number; revogacoes: number; outros: number; falhas: number;
  joiners: number; movers: number; leavers: number; pre_leavers: number;
}

export function useDashboardSeries(days: number) {
  return useQuery({
    queryKey: ["dashboard_series", days],
    queryFn: async () => { const { data, error } = await supabase.rpc("dashboard_series", { p_days: days }); if (error) throw error; return (data ?? []) as unknown as DashboardSeriesPoint[]; },
    ...REFETCH_OPTS,
    staleTime: 15_000,
  });
}
