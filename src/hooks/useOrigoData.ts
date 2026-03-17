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

const REFETCH_OPTS = { refetchOnWindowFocus: true, staleTime: 10000, refetchInterval: 30000 };

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

export function useOperadores() {
  return useQuery({ queryKey: ["operadores"], queryFn: () => fetchAll("operadores", "*", "nome"), ...REFETCH_OPTS });
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
        .select("*, cargos(nome), areas(nome), empresas(nome), localidades(nome), gestor:colaboradores!colaboradores_gestor_id_fkey(nome)")
        .eq("id", id!)
        .single();
      if (error) throw error;
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
    queryFn: async () => { const { data, error } = await supabase.from("terceiros").select("*").eq("id", id!).single(); if (error) throw error; return data; },
  });
}

export function useAplicacoes() {
  return useQuery({ queryKey: ["aplicacoes"], queryFn: () => fetchAll("aplicacoes", "*", "nome"), ...REFETCH_OPTS });
}

export function usePerfisAcesso() {
  return useQuery({ queryKey: ["perfis_acesso"], queryFn: () => fetchAll("perfis_acesso", "*, aplicacoes(nome)", "nome"), ...REFETCH_OPTS });
}

export function usePerfilAcesso(id: string | undefined) {
  return useQuery({
    queryKey: ["perfil_acesso", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("perfis_acesso").select("*, aplicacoes(nome)").eq("id", id!).single(); if (error) throw error; return data; },
  });
}

export function usePerfilComposicao(perfilId: string | undefined) {
  return useQuery({
    queryKey: ["perfil_composicao", perfilId], enabled: !!perfilId,
    queryFn: async () => { const { data, error } = await supabase.from("perfil_composicao").select("*").eq("perfil_id", perfilId!); if (error) throw error; return data; },
  });
}

export function usePerfilAtribuicoes(perfilId?: string, colaboradorId?: string) {
  return useQuery({
    queryKey: ["perfil_atribuicoes", perfilId, colaboradorId],
    queryFn: async () => {
      let q = supabase.from("perfil_atribuicoes").select("*, perfis_acesso(nome, aplicacoes(nome)), colaboradores(nome, cargos(nome), areas(nome))").eq("ativo", true);
      if (perfilId) q = q.eq("perfil_id", perfilId);
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useRegras() {
  return useQuery({ queryKey: ["regras"], queryFn: () => fetchAll("regras", "*", "prioridade"), ...REFETCH_OPTS });
}

export function useRegra(id: string | undefined) {
  return useQuery({
    queryKey: ["regra", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("regras").select("*").eq("id", id!).single(); if (error) throw error; return data; },
  });
}

export function useRegraCondicoes(regraId: string | undefined) {
  return useQuery({
    queryKey: ["regra_condicoes", regraId], enabled: !!regraId,
    queryFn: async () => { const { data, error } = await supabase.from("regra_condicoes").select("*").eq("regra_id", regraId!).order("ordem"); if (error) throw error; return data; },
  });
}

export function useRegraResultados(regraId: string | undefined) {
  return useQuery({
    queryKey: ["regra_resultados", regraId], enabled: !!regraId,
    queryFn: async () => { const { data, error } = await supabase.from("regra_resultados").select("*, perfis_acesso(nome)").eq("regra_id", regraId!).order("ordem"); if (error) throw error; return data; },
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

export function useSyncJobs() {
  return useQuery({
    queryKey: ["sync_jobs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sync_jobs").select("*").eq("tipo", "entra_apps").order("created_at", { ascending: false }).limit(1);
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
