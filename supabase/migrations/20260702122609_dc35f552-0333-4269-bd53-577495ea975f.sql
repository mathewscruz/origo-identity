-- Funções de administração usadas exclusivamente pelas ferramentas MCP do agente Hermes.
-- Ambas exigem papel admin do usuário chamador (via has_role + auth.uid()).
-- Rodam como SECURITY DEFINER para permitir DDL/DML irrestrito quando autorizado.

CREATE OR REPLACE FUNCTION public.admin_exec_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin';
  END IF;

  -- Registra a intenção antes da execução para preservar trilha mesmo em caso de erro
  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES (
    'admin_exec_sql',
    'database',
    'Execução SQL via MCP',
    COALESCE((auth.jwt() ->> 'email'), auth.uid()::text),
    jsonb_build_object('sql', p_sql)
  );

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || p_sql || ') t'
    INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_exec_ddl(p_sql text, p_description text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin';
  END IF;

  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES (
    'admin_exec_ddl',
    'database',
    COALESCE(p_description, 'Migração/DDL via MCP'),
    COALESCE((auth.jwt() ->> 'email'), auth.uid()::text),
    jsonb_build_object('sql', p_sql, 'description', p_description)
  );

  EXECUTE p_sql;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_exec_sql(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_exec_ddl(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_exec_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_exec_ddl(text, text) TO authenticated;