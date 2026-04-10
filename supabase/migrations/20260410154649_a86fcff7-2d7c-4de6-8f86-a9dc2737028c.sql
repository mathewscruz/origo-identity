
-- Recreate view with SECURITY INVOKER to satisfy linter
DROP VIEW IF EXISTS public.aplicacoes_safe;

CREATE VIEW public.aplicacoes_safe
WITH (security_invoker = true)
AS
SELECT
  id, nome, criticidade, tipo_auth, owner, aprovacao_necessaria, integracao_ativa,
  created_at, updated_at, entra_id, default_app_role_id, origem, connector_type, url,
  CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)
    THEN connector_config
    ELSE NULL
  END AS connector_config
FROM public.aplicacoes;
