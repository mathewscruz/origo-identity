DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND cmd IN ('INSERT','UPDATE')
      AND coalesce(qual,'')||coalesce(with_check,'') ILIKE '%operador%'
      AND tablename IN ('cargos','perfis_acesso','aplicacoes','cargo_perfis','perfil_aplicacoes','perfil_grupos','perfil_licencas','perfil_sharepoint','perfil_apps_internos','sod_conflitos','aplicacao_connectors','aplicacao_perfis_internos','areas','empresas','localidades','sharepoint_sites','sharepoint_pastas','licencas')
  LOOP
    IF r.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', r.policyname, r.tablename);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', r.policyname, r.tablename);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT user_id, 'platform_admin'::app_role FROM public.user_roles r WHERE role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles x WHERE x.user_id = r.user_id AND x.role = 'platform_admin');
DELETE FROM public.user_roles WHERE role = 'admin';

COMMENT ON TYPE public.app_role IS 'platform_admin = Super Admin; operador = Suporte; viewer = Leitor. admin is DEPRECATED (alias, no longer assigned).';