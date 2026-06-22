import { supabase } from "@/integrations/supabase/client";

type NotificationType =
  | "solicitacao_criada"
  | "solicitacao_decidida"
  | "excecao_criada"
  | "excecao_decidida"
  | "colaborador_desabilitado"
  | "terceiro_expirando"
  | "alerta_critico"
  | "revisao_concluida"
  | "revisao_lembrete"
  | "usuario_boas_vindas"
  | "usuario_senha_redefinida";


export async function sendNotificationEmail(
  tipo: NotificationType,
  payload: Record<string, any>
): Promise<void> {
  try {
    if (!payload.destinatario_email) {
      console.warn(`[sendNotificationEmail] Sem destinatário para tipo=${tipo}, ignorando.`);
      return;
    }
    await supabase.functions.invoke("send-notification-email", {
      body: { tipo, payload },
    });
  } catch (err) {
    console.error(`[sendNotificationEmail] Erro ao enviar ${tipo}:`, err);
  }
}
