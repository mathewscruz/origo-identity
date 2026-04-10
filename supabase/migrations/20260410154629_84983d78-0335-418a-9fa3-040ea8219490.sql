
-- 1. Fix anon policies on revisoes: scope to token
DROP POLICY IF EXISTS "Anon can select revisoes" ON public.revisoes;
DROP POLICY IF EXISTS "Anon can update revisoes" ON public.revisoes;

CREATE POLICY "Anon can select revisoes by token"
  ON public.revisoes FOR SELECT TO anon
  USING (token IS NOT NULL AND token = current_setting('request.headers', true)::json->>'x-review-token');

CREATE POLICY "Anon can update revisoes by token"
  ON public.revisoes FOR UPDATE TO anon
  USING (token IS NOT NULL AND token = current_setting('request.headers', true)::json->>'x-review-token');

-- 2. Fix anon policies on revisao_itens: scope to token via parent revisao
DROP POLICY IF EXISTS "Anon can select revisao_itens" ON public.revisao_itens;
DROP POLICY IF EXISTS "Anon can update revisao_itens" ON public.revisao_itens;

CREATE POLICY "Anon can select revisao_itens by token"
  ON public.revisao_itens FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.revisoes r
    WHERE r.id = revisao_itens.revisao_id
      AND r.token IS NOT NULL
      AND r.token = current_setting('request.headers', true)::json->>'x-review-token'
  ));

CREATE POLICY "Anon can update revisao_itens by token"
  ON public.revisao_itens FOR UPDATE TO anon
  USING (EXISTS (
    SELECT 1 FROM public.revisoes r
    WHERE r.id = revisao_itens.revisao_id
      AND r.token IS NOT NULL
      AND r.token = current_setting('request.headers', true)::json->>'x-review-token'
  ));

-- 3. Fix user_roles SELECT: users see own role, admins see all
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 4. Create safe view for aplicacoes that strips connector_config for non-admins
CREATE OR REPLACE VIEW public.aplicacoes_safe AS
SELECT
  id, nome, criticidade, tipo_auth, owner, aprovacao_necessaria, integracao_ativa,
  created_at, updated_at, entra_id, default_app_role_id, origem, connector_type, url,
  CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)
    THEN connector_config
    ELSE NULL
  END AS connector_config
FROM public.aplicacoes;
