import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  acao: string;
  entidade: string;
  entidade_id?: string;
  resumo?: string;
  operador?: string;
  detalhes?: Record<string, any>;
}

async function currentOperator(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.email || "painel";
  } catch {
    return "painel";
  }
}

export async function logAuditoria(entry: AuditEntry) {
  try {
    await supabase.from("auditoria").insert({
      acao: entry.acao,
      entidade: entry.entidade,
      entidade_id: entry.entidade_id || null,
      resumo: entry.resumo || null,
      operador: entry.operador || (await currentOperator()),
      detalhes: entry.detalhes || null,
    } as any);
  } catch (err) {
    console.error("[auditLogger] Falha ao registrar auditoria:", err);
  }
}

export async function logAlerta(params: {
  titulo: string;
  mensagem?: string;
  severidade?: "info" | "aviso" | "critico";
  tipo: string;
  ref_url?: string;
  ref_id?: string;
  ref_tipo?: string;
}) {
  try {
    await supabase.from("alertas").insert({
      titulo: params.titulo,
      mensagem: params.mensagem || null,
      severidade: params.severidade || "info",
      tipo: params.tipo,
      ref_url: params.ref_url || null,
      ref_id: params.ref_id || null,
      ref_tipo: params.ref_tipo || null,
    } as any);
  } catch (err) {
    console.error("[auditLogger] Falha ao registrar alerta:", err);
  }
}
