ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS notificado_em timestamptz;
COMMENT ON COLUMN public.alertas.notificado_em IS 'Quando o Hermes enviou este alerta ao responsável pelo Telegram dele';
CREATE INDEX IF NOT EXISTS alertas_nao_notificados_idx ON public.alertas (created_at) WHERE notificado_em IS NULL AND lido = false;