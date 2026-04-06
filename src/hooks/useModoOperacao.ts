import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useModoOperacao() {
  const query = useQuery({
    queryKey: ["modo_operacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parametros")
        .select("valor")
        .eq("chave", "modo_operacao")
        .single();
      if (error) return "simulacao";
      return data?.valor || "simulacao";
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });
  return {
    modo: (query.data as string) || "simulacao",
    isSimulacao: (query.data as string) !== "producao",
    isLoading: query.isLoading,
  };
}
