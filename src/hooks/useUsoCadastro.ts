import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Coluna = "area_id" | "empresa_id" | "localidade_id";

/** Quantas pessoas (colaboradores) usam cada área/empresa/localidade — usado para bloquear exclusão. */
export function useUsoCadastro(coluna: Coluna) {
  const { data } = useQuery({
    queryKey: ["uso_cadastro", coluna],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (let from = 0; ; from += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("colaboradores").select(coluna).not(coluna, "is", null).range(from, from + 999);
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data ?? []) as any[]) counts[r[coluna]] = (counts[r[coluna]] ?? 0) + 1;
        if (!data || data.length < 1000) break;
      }
      return counts;
    },
    staleTime: 60_000,
  });
  return data ?? {};
}
