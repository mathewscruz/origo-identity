-- Parâmetros das integrações (antes hardcoded nas edge functions)
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('csv_email_dominio', 'origoenergia.com.br', 'Domínio do e-mail corporativo gerado para novos colaboradores do CSV do RH'),
  ('csv_gerar_email_corporativo', 'true', 'Gerar e-mail corporativo (nome.sobrenome@dominio) para novos colaboradores cujo e-mail no RH não é corporativo'),
  ('ad_upn_dominio', 'ebessolar.local', 'Domínio do userPrincipalName usado na criação de contas no AD local'),
  ('sharepoint_rh_site', 'origoenergia.sharepoint.com:/sites/dataanalytics', 'Site do SharePoint onde o RH publica a base de colaboradores'),
  ('sharepoint_rh_pasta', 'RH_COLAB', 'Pasta (no drive raiz do site) com os CSVs do RH'),
  ('sharepoint_rh_prefixo', 'base_colab_', 'Prefixo dos arquivos CSV do RH'),
  ('iam_orphan_ignore_prefixes', 'svc.,admin.,test.,sa.,adm.,notif.,noreply,sync.', 'Prefixos de UPN ignorados na detecção de contas órfãs no Entra')
ON CONFLICT (chave) DO NOTHING;
