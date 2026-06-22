
-- 1. Connector config split
CREATE TABLE IF NOT EXISTS public.aplicacao_connectors (
  aplicacao_id uuid PRIMARY KEY REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aplicacao_connectors TO authenticated;
GRANT ALL ON public.aplicacao_connectors TO service_role;

ALTER TABLE public.aplicacao_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/operador read connectors"
  ON public.aplicacao_connectors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "admin/operador insert connectors"
  ON public.aplicacao_connectors FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "admin/operador update connectors"
  ON public.aplicacao_connectors FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "admin delete connectors"
  ON public.aplicacao_connectors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_aplicacao_connectors_updated
  BEFORE UPDATE ON public.aplicacao_connectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.aplicacao_connectors (aplicacao_id, config)
SELECT id, connector_config
FROM public.aplicacoes
WHERE connector_config IS NOT NULL
ON CONFLICT (aplicacao_id) DO UPDATE SET config = EXCLUDED.config;

DROP VIEW IF EXISTS public.aplicacoes_safe;
ALTER TABLE public.aplicacoes DROP COLUMN IF EXISTS connector_config;

-- 2. contas_admin_conhecidas — admin/operador read only
DROP POLICY IF EXISTS "auth read contas_admin" ON public.contas_admin_conhecidas;
CREATE POLICY "admin/operador read contas_admin"
  ON public.contas_admin_conhecidas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));

-- 3. Realtime whitelist
DROP POLICY IF EXISTS "Authenticated can subscribe to iam_queue channel" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can subscribe iam_queue" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated to read messages" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated read whitelisted topics" ON realtime.messages;

CREATE POLICY "authenticated read whitelisted topics"
  ON realtime.messages FOR SELECT TO authenticated
  USING (realtime.topic() IN ('iam_queue', 'public:iam_queue'));
