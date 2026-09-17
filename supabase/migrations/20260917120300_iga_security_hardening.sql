-- =============================================================================
-- IGA hardening (4/7): segurança e segregação
--   • auditoria append-only (sem UPDATE/DELETE, nem via service_role)
--   • parametros só admin
--   • papel platform_admin: único que pode executar admin_exec_sql/ddl e purgar
--   • identidades nunca são apagadas: DELETE em colaboradores vira desligamento
--   • eventos_jml sobrevivem ao colaborador (FK SET NULL em vez de CASCADE)
--   • token de revisão externa com validade
--   • apply_reconcile_updates só para service_role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auditoria imutável
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "Admins can delete auditoria" ON public.auditoria;
REVOKE UPDATE, DELETE ON public.auditoria FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.auditoria_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- retenção controlada: só com a flag de sessão explícita (RPC de platform_admin)
  IF COALESCE(current_setting('origo.allow_audit_purge', true), '') = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'auditoria é append-only (% não permitido)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_auditoria_immutable ON public.auditoria;
CREATE TRIGGER trg_auditoria_immutable
  BEFORE UPDATE OR DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.auditoria_immutable();

-- ---------------------------------------------------------------------------
-- 2. Parâmetros: escrita só admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert parametros" ON public.parametros;
DROP POLICY IF EXISTS "Admins can update parametros" ON public.parametros;
DROP POLICY IF EXISTS "Admins can delete parametros" ON public.parametros;
CREATE POLICY "Only admins insert parametros" ON public.parametros FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins update parametros" ON public.parametros FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins delete parametros" ON public.parametros FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Papel platform_admin
--    (o valor novo do enum não pode ser usado como literal nesta mesma
--     transação; por isso as comparações abaixo usam role::text)
-- ---------------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'platform_admin');
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- só platform_admin concede/revoga platform_admin
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));
CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));

-- SQL/DDL arbitrário (MCP) passa a exigir platform_admin
CREATE OR REPLACE FUNCTION public.admin_exec_ddl(p_sql text, p_description text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES ('admin_exec_ddl', 'database', COALESCE(p_description, 'Migração/DDL via MCP'),
          COALESCE((auth.jwt() ->> 'email'), auth.uid()::text), jsonb_build_object('sql', p_sql, 'description', p_description));
  EXECUTE p_sql;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_exec_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES ('admin_exec_sql', 'database', 'Execução SQL via MCP', COALESCE((auth.jwt() ->> 'email'), auth.uid()::text), jsonb_build_object('sql', p_sql));
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || p_sql || ') t' INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Identidades nunca são apagadas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.colaboradores_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('origo.allow_hard_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status::text <> 'desligado' THEN
    UPDATE public.colaboradores SET status = 'desligado', updated_at = now() WHERE id = OLD.id;
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('delete_convertido_em_desligamento', 'colaboradores', OLD.id::text,
          COALESCE(auth.jwt() ->> 'email', current_user),
          format('Tentativa de exclusão de %s convertida em desligamento (identidades são preservadas para auditoria).', OLD.nome));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_colaboradores_soft_delete ON public.colaboradores;
CREATE TRIGGER trg_colaboradores_soft_delete
  BEFORE DELETE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.colaboradores_soft_delete();

-- Purga real (dados de teste/importação errada): só platform_admin, auditada
CREATE OR REPLACE FUNCTION public.admin_purge_colaboradores(p_ids uuid[], p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 10 caracteres)';
  END IF;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('purgar_colaboradores', 'colaboradores', COALESCE(auth.jwt() ->> 'email', auth.uid()::text),
          format('Purga permanente de %s colaborador(es): %s', COALESCE(array_length(p_ids,1),0), p_motivo),
          jsonb_build_object('ids', p_ids));
  PERFORM set_config('origo.allow_hard_delete', 'on', true);
  DELETE FROM public.perfil_atribuicoes WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.colab_quarentena WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.excecoes WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.revisao_itens WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.colaboradores WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('origo.allow_hard_delete', 'off', true);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_purge_colaboradores(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_colaboradores(uuid[], text) TO authenticated;

-- eventos JML sobrevivem ao colaborador
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
   WHERE conrelid = 'public.eventos_jml'::regclass AND contype = 'f'
     AND pg_get_constraintdef(oid) LIKE '%colaboradores(id)%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.eventos_jml DROP CONSTRAINT %I', v_con);
  END IF;
  ALTER TABLE public.eventos_jml
    ADD CONSTRAINT eventos_jml_colaborador_id_fkey FOREIGN KEY (colaborador_id)
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Revisão externa: token com validade
-- ---------------------------------------------------------------------------
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
UPDATE public.revisoes SET token_expires_at = COALESCE(data_fim::timestamptz + interval '7 days', created_at + interval '30 days')
 WHERE token IS NOT NULL AND token_expires_at IS NULL;
ALTER TABLE public.revisoes ALTER COLUMN token_expires_at SET DEFAULT now() + interval '30 days';

CREATE OR REPLACE FUNCTION public.get_revisao_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT row_to_json(r.*) FROM revisoes r
   WHERE r.token = p_token
     AND (r.token_expires_at IS NULL OR r.token_expires_at > now())
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_revisao_itens_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_agg(ri.*)
    FROM revisao_itens ri
    JOIN revisoes r ON r.id = ri.revisao_id
   WHERE r.token = p_token
     AND (r.token_expires_at IS NULL OR r.token_expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- 6. Índices auxiliares de segurança/consulta
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_auditoria_timestamp ON public.auditoria ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade ON public.auditoria (entidade, entidade_id);
