-- licencas: restringe leitura completa a admin/operador
DROP POLICY IF EXISTS "Authenticated can select licencas" ON public.licencas;
CREATE POLICY "Admins e operadores podem ver licencas"
ON public.licencas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operador'::public.app_role));

-- catálogo reduzido para o portal (sem custo/renovação)
CREATE OR REPLACE VIEW public.licencas_catalogo
WITH (security_invoker = off) AS
SELECT id, nome, aplicacao_id, owner, tipo
FROM public.licencas;

GRANT SELECT ON public.licencas_catalogo TO authenticated;

-- sharepoint_sites
DROP POLICY IF EXISTS "Authenticated can select sharepoint_sites" ON public.sharepoint_sites;
CREATE POLICY "Admins e operadores podem ver sharepoint_sites"
ON public.sharepoint_sites FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operador'::public.app_role));

-- sharepoint_pastas
DROP POLICY IF EXISTS "Authenticated can select sharepoint_pastas" ON public.sharepoint_pastas;
CREATE POLICY "Admins e operadores podem ver sharepoint_pastas"
ON public.sharepoint_pastas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operador'::public.app_role));

-- perfil_sharepoint
DROP POLICY IF EXISTS "Authenticated can select perfil_sharepoint" ON public.perfil_sharepoint;
CREATE POLICY "Admins e operadores podem ver perfil_sharepoint"
ON public.perfil_sharepoint FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operador'::public.app_role));

-- workflow_etapa_aprovadores: admin/operador ou o próprio aprovador
DROP POLICY IF EXISTS "wf_apr_select_auth" ON public.workflow_etapa_aprovadores;
CREATE POLICY "wf_apr_select_scoped"
ON public.workflow_etapa_aprovadores FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'operador'::public.app_role)
  OR lower(coalesce(email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);