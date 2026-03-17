
-- Add anonymous read access to all tables so the app works without auth
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'empresas','localidades','areas','cargos','operadores','parametros',
      'colaboradores','terceiros','aplicacoes','perfis_acesso','perfil_composicao',
      'perfil_atribuicoes','regras','regra_condicoes','regra_resultados',
      'eventos_jml','evento_jml_acoes','evento_jml_aprovacoes',
      'excecoes','revisoes','revisao_itens','licencas','auditoria','alertas',
      'user_roles'
    ])
  LOOP
    EXECUTE format('CREATE POLICY "Anon can select %1$s" ON public.%1$I FOR SELECT TO anon USING (true)', tbl);
  END LOOP;
END $$;
