import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface InvokeResult<T = Json> {
  data: T | null;
  /** mensagem legível (o corpo `{ error }` da função, quando existe) ou null */
  error: string | null;
  status?: number;
}

/**
 * Chama uma edge function com a sessão do usuário e devolve a mensagem de erro
 * real da função (o `supabase.functions.invoke` só diz "non-2xx status code").
 */
export async function invokeFunction<T = Json>(name: string, body?: Record<string, unknown>): Promise<InvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, body === undefined ? undefined : { body });
  if (!error) {
    if (data && typeof data === "object" && typeof (data as Json).error === "string") return { data: null, error: (data as Json).error };
    return { data: data as T, error: null };
  }
  const ctx = (error as { context?: Response }).context;
  let message = error.message || "Erro ao chamar a função";
  let status: number | undefined;
  if (ctx && typeof ctx === "object" && "status" in ctx) {
    status = (ctx as Response).status;
    try {
      const text = await (ctx as Response).clone().text();
      try { const j = JSON.parse(text); message = j?.error || j?.message || text || message; } catch { if (text) message = text; }
    } catch { /* corpo indisponível */ }
    if (status === 401) message = "Sessão expirada — entre novamente.";
    else if (status === 403 && /acesso negado/i.test(message)) message = "Sem permissão para esta operação.";
  }
  return { data: null, error: message, status };
}
