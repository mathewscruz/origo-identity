
-- Helper: any app role
CREATE OR REPLACE FUNCTION public.has_any_app_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role(uuid) FROM PUBLIC, anon, authenticated;

-- Tighten SELECT policies on sensitive tables
DROP POLICY IF EXISTS "Authenticated can select auditoria" ON public.auditoria;
CREATE POLICY "Admins/operadores can select auditoria" ON public.auditoria
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Authenticated can select colab_snapshots" ON public.colab_snapshots;
CREATE POLICY "Admins/operadores can select colab_snapshots" ON public.colab_snapshots
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Authenticated can select colaboradores" ON public.colaboradores;
CREATE POLICY "App roles can select colaboradores" ON public.colaboradores
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'viewer'::app_role));

DROP POLICY IF EXISTS "Authenticated can select empresas" ON public.empresas;
CREATE POLICY "App roles can select empresas" ON public.empresas
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'viewer'::app_role));

DROP POLICY IF EXISTS "Authenticated can select entra_role_members" ON public.entra_role_members;
CREATE POLICY "Admins/operadores can select entra_role_members" ON public.entra_role_members
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Authenticated can select iam_queue" ON public.iam_queue;
CREATE POLICY "Admins/operadores can select iam_queue" ON public.iam_queue
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Authenticated can select parametros" ON public.parametros;
CREATE POLICY "Admins/operadores can select parametros" ON public.parametros
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Authenticated can select terceiros" ON public.terceiros;
CREATE POLICY "App roles can select terceiros" ON public.terceiros
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role) OR has_role(auth.uid(), 'viewer'::app_role));

-- Remove the broad permissive policy from solicitacoes_acesso (keep the scoped one)
DROP POLICY IF EXISTS "Authenticated can select solicitacoes_acesso" ON public.solicitacoes_acesso;

-- Storage: avatars bucket — restrict listing to authenticated users (public CDN URL still works)
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
CREATE POLICY "Authenticated can read avatars" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Revoke EXECUTE on SECURITY DEFINER helper functions from public/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
