import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function fetchAll(
  table: string,
  select: string,
  orderCol: string,
  ascending = true
): Promise<any[]> {
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
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

const REFETCH_OPTS = { refetchOnWindowFocus: false, staleTime: 60_000, refetchInterval: false as const };

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
      // Fetch gestor name separately to avoid self-join issues
      if (data?.gestor_id) {
        const { data: gestorData } = await supabase
          .from("colaboradores")
          .select("nome")
          .eq("id", data.gestor_id)
          .single();
        (data as any).gestor = gestorData || null;
      }
      return data;
    },
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
      const respId = (data as any)?.responsavel_colaborador_id;
      if (respId) {
        const { data: resp } = await supabase.from("colaboradores").select("id, nome, email").eq("id", respId).single();
        (data as any).responsavel_colaborador = resp || null;
      }
      return data;
    },
  });
}

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
  });
}


export function usePerfilAtribuicoes(perfilId?: string, colaboradorId?: string) {
  return useQuery({
    queryKey: ["perfil_atribuicoes", perfilId, colaboradorId],
    queryFn: async () => {
      let q = supabase.from("perfil_atribuicoes").select("*, perfis_acesso(nome, perfil_aplicacoes(aplicacao_id, aplicacoes(nome))), colaboradores(nome, cargos(nome), areas(nome))").eq("ativo", true);
      if (perfilId) q = q.eq("perfil_id", perfilId);
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useEventosJML() {
  return useQuery({ queryKey: ["eventos_jml"], queryFn: () => fetchAll("eventos_jml", "*", "created_at", false), ...REFETCH_OPTS });
}

export function useEventoJML(id: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("eventos_jml").select("*").eq("id", id!).single(); if (error) throw error; return data; },
  });
}

export function useEventoJMLAcoes(eventoId: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml_acoes", eventoId], enabled: !!eventoId,
    queryFn: async () => { const { data, error } = await supabase.from("evento_jml_acoes").select("*").eq("evento_id", eventoId!); if (error) throw error; return data; },
  });
}

export function useEventoJMLAprovacoes(eventoId: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml_aprovacoes", eventoId], enabled: !!eventoId,
    queryFn: async () => { const { data, error } = await supabase.from("evento_jml_aprovacoes").select("*").eq("evento_id", eventoId!).order("etapa"); if (error) throw error; return data; },
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
  });
}

export function useRevisaoItens(revisaoId: string | undefined) {
  return useQuery({
    queryKey: ["revisao_itens", revisaoId], enabled: !!revisaoId,
    queryFn: async () => { const { data, error } = await supabase.from("revisao_itens").select("*").eq("revisao_id", revisaoId!); if (error) throw error; return data; },
  });
}

export function useLicencas() {
  return useQuery({ queryKey: ["licencas"], queryFn: () => fetchAll("licencas", "*, aplicacoes(nome)", "nome"), ...REFETCH_OPTS });
}

export function useAuditoria() {
  return useQuery({ queryKey: ["auditoria"], queryFn: () => fetchAll("auditoria", "*", "timestamp", false), ...REFETCH_OPTS });
}

export function useAlertas() {
  return useQuery({ queryKey: ["alertas"], queryFn: () => fetchAll("alertas", "*", "data", false), ...REFETCH_OPTS });
}


export function useSyncJobsCsv() {
  return useQuery({
    queryKey: ["sync_jobs_csv"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sync_jobs").select("*").eq("tipo", "csv_colab").order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    refetchInterval: (query: any) => {
      const job = query.state.data;
      if (job && job.status === "running") return 2000;
      return false;
    },
  });
}

export function useEntraLicencas() {
  return useQuery({ queryKey: ["entra_licencas"], queryFn: () => fetchAll("entra_licencas", "*", "nome"), ...REFETCH_OPTS });
}

/** Real usage per external license, computed from successful iam_queue assignments. */
export function useLicencasExternasUso() {
  return useQuery({
    queryKey: ["licencas_externas_uso"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("licencas_externas_uso")
        .select("licenca_id, em_uso_calc");
      if (error) throw error;
      return (data ?? []) as { licenca_id: string; em_uso_calc: number }[];
    },
    ...REFETCH_OPTS,
  });
}


export function useEntraGrupos() {
  return useQuery({ queryKey: ["entra_grupos"], queryFn: () => fetchAll("entra_grupos", "*", "nome"), ...REFETCH_OPTS });
}

export function useColabQuarentena() {
  return useQuery({
    queryKey: ["colab_quarentena"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("colab_quarentena").select("*, colaboradores(nome, email, matricula)").eq("status", "pendente").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSharepointSites() {
  return useQuery({ queryKey: ["sharepoint_sites"], queryFn: () => fetchAll("sharepoint_sites", "*", "nome"), ...REFETCH_OPTS });
}

export function useSharepointPastas(siteDbId?: string) {
  return useQuery({
    queryKey: ["sharepoint_pastas", siteDbId],
    enabled: !!siteDbId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sharepoint_pastas").select("*").eq("site_db_id", siteDbId!).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllSharepointPastas() {
  return useQuery({
    queryKey: ["sharepoint_pastas_all"],
    queryFn: () => fetchAll("sharepoint_pastas", "*", "nome"),
    ...REFETCH_OPTS,
  });
}

export function usePerfilSharepoint(perfilId?: string) {
  return useQuery({
    queryKey: ["perfil_sharepoint", perfilId],
    enabled: !!perfilId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("perfil_sharepoint")
        .select("*, sharepoint_sites(nome, url)")
        .eq("perfil_id", perfilId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useColabIndividualQueue(colaboradorId: string | undefined) {
  return useQuery({
    queryKey: ["colab_individual_queue", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("iam_queue")
        .select("*")
        .eq("colaborador_id", colaboradorId!)
        .in("requested_by", ["manual_individual", "entra_sync"])
        .in("action_type", ["assign_group", "assign_license", "assign_app", "remove_group", "remove_license", "remove_app"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data) return [];

      const keyOf = (row: any) => {
        const p = row.payload_json || {};
        const at = row.action_type as string;
        if (at.includes("group")) return `group:${p?.groupId || ""}`;
        if (at.includes("license")) return `license:${p?.skuId || ""}`;
        if (at.includes("app")) return `app:${p?.appId || ""}:${p?.appRoleId || ""}`;
        return `${at}:${row.id}`;
      };

      // Latest state per key (any origin) — tells us if resource is still assigned.
      const latestState = new Map<string, any>();
      // Latest manual assign per key — preferred display row when active.
      const latestManualAssign = new Map<string, any>();

      for (const row of data) {
        const key = keyOf(row);
        latestState.set(key, row);
        if (row.requested_by === "manual_individual" && row.action_type.startsWith("assign_")) {
          latestManualAssign.set(key, row);
        }
        if (row.action_type.startsWith("remove_")) {
          // A remove supersedes prior manual assign for that key
          latestManualAssign.delete(key);
        }
      }

      const out: any[] = [];
      for (const [key, current] of latestState) {
        if (!current.action_type.startsWith("assign_")) continue;
        // Preserve manual origin visibility even if a later sync row exists.
        out.push(latestManualAssign.get(key) ?? current);
      }
      return out;
    },
    ...REFETCH_OPTS,
  });
}

