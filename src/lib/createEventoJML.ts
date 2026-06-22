import { supabase } from "@/integrations/supabase/client";

export async function createEventoJML(params: {
  colaboradorId: string;
  colaboradorNome: string;
  tipo: "joiner" | "mover" | "leaver" | "pre_leaver" | "pre_leaver_revertido";
  dadosAntes?: Record<string, any> | null;
  dadosDepois?: Record<string, any> | null;
}) {
  const { error } = await supabase.from("eventos_jml").insert({
    colaborador_id: params.colaboradorId,
    colaborador_nome: params.colaboradorNome,
    tipo: params.tipo as any,
    origem: "manual",
    status: "executado",
    dados_antes: params.dadosAntes || null,
    dados_depois: params.dadosDepois || null,
  } as any);
  return { error };
}
