DO $$
DECLARE r record;
  pred text := '(public.has_role(auth.uid(),''platform_admin''::public.app_role) OR public.has_role(auth.uid(),''admin''::public.app_role) OR public.has_role(auth.uid(),''operador''::public.app_role) OR public.has_role(auth.uid(),''viewer''::public.app_role))';
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('cargos','Authenticated can select cargos'),
    ('entra_grupos','Authenticated can select entra_grupos'),
    ('perfil_licencas','Authenticated can select perfil_licencas'),
    ('perfis_acesso','Authenticated can select perfis_acesso'),
    ('areas','Authenticated can select areas'),
    ('perfil_aplicacoes','Authenticated can select perfil_aplicacoes'),
    ('aplicacao_perfis_internos','Authenticated can select aplicacao_perfis_internos'),
    ('aplicacoes','Authenticated can select aplicacoes'),
    ('iam_agent_status','Authenticated can view agent status'),
    ('entra_roles','Authenticated can select entra_roles'),
    ('perfil_grupos','Authenticated can select perfil_grupos'),
    ('entra_licencas','Authenticated can select entra_licencas'),
    ('perfil_apps_internos','Authenticated can select perfil_apps_internos'),
    ('sod_conflitos','Authenticated can select sod_conflitos'),
    ('cargo_perfis','Authenticated can select cargo_perfis'),
    ('localidades','Authenticated can select localidades')
  ) AS t(tbl, pol) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING %s', 'Panel roles can select '||r.tbl, r.tbl, pred);
  END LOOP;
END $$;