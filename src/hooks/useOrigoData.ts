import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Empresas ──
export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Localidades ──
export function useLocalidades() {
  return useQuery({
    queryKey: ["localidades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("localidades").select("*, empresas(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Áreas ──
export function useAreas() {
  return useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*, empresas(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Cargos ──
export function useCargos() {
  return useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("*, areas(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Operadores ──
export function useOperadores() {
  return useQuery({
    queryKey: ["operadores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("operadores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Parâmetros ──
export function useParametros() {
  return useQuery({
    queryKey: ["parametros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parametros").select("*").order("chave");
      if (error) throw error;
      return data;
    },
  });
}

// ── Colaboradores ──
export function useColaboradores() {
  return useQuery({
    queryKey: ["colaboradores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select("*, cargos(nome), areas(nome), empresas(nome), localidades(nome)")
        .order("nome");
      if (error) throw error;
      return data;
    },
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

// ── Terceiros ──
export function useTerceiros() {
  return useQuery({
    queryKey: ["terceiros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terceiros").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

export function useTerceiro(id: string | undefined) {
  return useQuery({
    queryKey: ["terceiro", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("terceiros").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

// ── Aplicações ──
export function useAplicacoes() {
  return useQuery({
    queryKey: ["aplicacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("aplicacoes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Perfis de Acesso ──
export function usePerfisAcesso() {
  return useQuery({
    queryKey: ["perfis_acesso"],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis_acesso").select("*, aplicacoes(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

export function usePerfilAcesso(id: string | undefined) {
  return useQuery({
    queryKey: ["perfil_acesso", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis_acesso").select("*, aplicacoes(nome)").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function usePerfilComposicao(perfilId: string | undefined) {
  return useQuery({
    queryKey: ["perfil_composicao", perfilId],
    enabled: !!perfilId,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil_composicao").select("*").eq("perfil_id", perfilId!);
      if (error) throw error;
      return data;
    },
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

// ── Regras ──
export function useRegras() {
  return useQuery({
    queryKey: ["regras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("regras").select("*").order("prioridade");
      if (error) throw error;
      return data;
    },
  });
}

export function useRegra(id: string | undefined) {
  return useQuery({
    queryKey: ["regra", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("regras").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRegraCondicoes(regraId: string | undefined) {
  return useQuery({
    queryKey: ["regra_condicoes", regraId],
    enabled: !!regraId,
    queryFn: async () => {
      const { data, error } = await supabase.from("regra_condicoes").select("*").eq("regra_id", regraId!).order("ordem");
      if (error) throw error;
      return data;
    },
  });
}

export function useRegraResultados(regraId: string | undefined) {
  return useQuery({
    queryKey: ["regra_resultados", regraId],
    enabled: !!regraId,
    queryFn: async () => {
      const { data, error } = await supabase.from("regra_resultados").select("*, perfis_acesso(nome)").eq("regra_id", regraId!).order("ordem");
      if (error) throw error;
      return data;
    },
  });
}

// ── Eventos JML ──
export function useEventosJML() {
  return useQuery({
    queryKey: ["eventos_jml"],
    queryFn: async () => {
      const { data, error } = await supabase.from("eventos_jml").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEventoJML(id: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("eventos_jml").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useEventoJMLAcoes(eventoId: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml_acoes", eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("evento_jml_acoes").select("*").eq("evento_id", eventoId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useEventoJMLAprovacoes(eventoId: string | undefined) {
  return useQuery({
    queryKey: ["evento_jml_aprovacoes", eventoId],
    enabled: !!eventoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("evento_jml_aprovacoes").select("*").eq("evento_id", eventoId!).order("etapa");
      if (error) throw error;
      return data;
    },
  });
}

// ── Exceções ──
export function useExcecoes() {
  return useQuery({
    queryKey: ["excecoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("excecoes").select("*, perfis_acesso(nome)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ── Revisões ──
export function useRevisoes() {
  return useQuery({
    queryKey: ["revisoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("revisoes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRevisao(id: string | undefined) {
  return useQuery({
    queryKey: ["revisao", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("revisoes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRevisaoItens(revisaoId: string | undefined) {
  return useQuery({
    queryKey: ["revisao_itens", revisaoId],
    enabled: !!revisaoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("revisao_itens").select("*").eq("revisao_id", revisaoId!);
      if (error) throw error;
      return data;
    },
  });
}

// ── Licenças ──
export function useLicencas() {
  return useQuery({
    queryKey: ["licencas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licencas").select("*, aplicacoes(nome)").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

// ── Auditoria ──
export function useAuditoria() {
  return useQuery({
    queryKey: ["auditoria"],
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria").select("*").order("timestamp", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ── Alertas ──
export function useAlertas() {
  return useQuery({
    queryKey: ["alertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("alertas").select("*").order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
