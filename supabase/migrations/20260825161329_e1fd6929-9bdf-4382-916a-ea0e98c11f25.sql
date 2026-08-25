DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'colaboradores','terceiros','aplicacoes','perfis_acesso','perfil_atribuicoes',
    'eventos_jml','evento_jml_acoes','evento_jml_aprovacoes','excecoes','revisoes','revisao_itens',
    'licencas','entra_licencas','entra_grupos','auditoria','alertas','sync_jobs','colab_quarentena',
    'solicitacoes_acesso','solicitacao_itens','empresas','areas','cargos','localidades','parametros',
    'entra_roles','entra_role_members','sharepoint_sites','sharepoint_pastas','perfil_grupos',
    'perfil_licencas','perfil_aplicacoes','perfil_sharepoint','cargo_perfis','user_roles','profiles',
    'workflow_fluxos','workflow_etapas','workflow_execucoes','sod_conflitos','regras'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;