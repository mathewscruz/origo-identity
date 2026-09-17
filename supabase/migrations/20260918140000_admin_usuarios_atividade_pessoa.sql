-- =============================================================================
-- 2026-09-18 — Gestão de usuários do painel + atividade por pessoa
--
-- 1. profiles: admins podiam ler, mas NÃO editar/desativar outros usuários (só a
--    própria linha) — o painel mostrava "Usuário desativado" e nada mudava.
--    Política de UPDATE para admin (hierárquica: platform_admin ⊇ admin).
--    A gestão em si (criar, editar, desativar/reativar com bloqueio no Auth,
--    excluir, redefinir senha) passa pela edge function `admin-users`.
-- 2. admin_usuarios_resumo(): lista para o painel com papel, último acesso e
--    bloqueio (auth.users não é legível pelo cliente).
-- 3. dashboard_activity: filtro por pessoa (colaborador ou terceiro) para a
--    aba "Atividade" das páginas de detalhe.
-- Tudo idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS: admin edita qualquer perfil do painel
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Lista de usuários do painel (admin): perfil + papel + dados do Auth
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usuarios_resumo()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.has_role(auth.uid(), 'admin') THEN '[]'::jsonb ELSE (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'email', p.email, 'ativo', p.ativo, 'avatar_url', p.avatar_url,
      'must_change_password', p.must_change_password, 'created_at', p.created_at,
      'role', COALESCE((SELECT r.role::text FROM public.user_roles r WHERE r.user_id = p.id
                        ORDER BY CASE r.role::text WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'operador' THEN 2 ELSE 3 END LIMIT 1), 'viewer'),
      'last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until, 'bloqueado', u.banned_until IS NOT NULL AND u.banned_until > now(),
      'auditoria_30d', (SELECT count(*) FROM public.auditoria a WHERE a.operador = p.email AND a."timestamp" >= now() - interval '30 days')
    ) ORDER BY p.nome), '[]'::jsonb)
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
  ) END;
$$;
REVOKE ALL ON FUNCTION public.admin_usuarios_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usuarios_resumo() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. dashboard_activity com filtro por pessoa
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_activity(integer, text);
CREATE OR REPLACE FUNCTION public.dashboard_activity(p_limit integer DEFAULT 40, p_categoria text DEFAULT NULL, p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200) AS n),
  pid AS (SELECT COALESCE(p_colaborador_id, p_terceiro_id)::text AS id),
  fila AS (
    SELECT 'fila'::text AS fonte, q.id::text AS id,
           GREATEST(q.created_at, COALESCE(q.processed_at, q.created_at), COALESCE(q.approved_at, q.created_at)) AS ts,
           'acesso'::text AS categoria,
           q.action_type AS acao,
           COALESCE(c.nome, t.nome, q.payload_json->>'displayName', q.target_identity, '—') AS pessoa,
           CASE WHEN c.id IS NOT NULL THEN 'colaborador' WHEN t.id IS NOT NULL THEN 'terceiro' ELSE NULL END AS pessoa_tipo,
           COALESCE(q.payload_json->>'groupName', q.payload_json->>'licenseName', q.payload_json->>'appName', q.payload_json->>'siteName',
                    NULLIF(q.payload_json->>'siteUrl', ''), NULL) AS recurso,
           q.status::text AS status,
           COALESCE(q.processed_by, pa.email, q.requested_by, 'sistema') AS ator,
           q.requested_by AS origem,
           left(COALESCE(q.result_message, q.rejection_reason, q.payload_json->>'motivo', ''), 160) AS detalhe,
           '/fila-provisionamento/' || q.id AS link
      FROM public.iam_queue q
      LEFT JOIN public.colaboradores c ON c.id = q.colaborador_id
      LEFT JOIN public.terceiros t ON t.id = q.terceiro_id
      LEFT JOIN public.profiles pa ON pa.id = q.approved_by
     WHERE (q.status::text <> 'cancelled' OR q.processed_at >= now() - interval '1 day')
       AND (p_colaborador_id IS NULL OR q.colaborador_id = p_colaborador_id)
       AND (p_terceiro_id IS NULL OR q.terceiro_id = p_terceiro_id)
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  jml AS (
    SELECT 'jml'::text, e.id::text, COALESCE(e.updated_at, e.created_at), 'pessoa'::text,
           'jml_' || e.tipo::text, COALESCE(e.colaborador_nome, '—'),
           CASE WHEN e.terceiro_id IS NOT NULL THEN 'terceiro' ELSE 'colaborador' END,
           NULL::text, e.status::text, COALESCE(e.origem, 'sistema'), e.origem,
           left(COALESCE(e.erro_mensagem, ''), 160), '/eventos-jml/' || e.id
      FROM public.eventos_jml e
     WHERE (p_colaborador_id IS NULL OR e.colaborador_id = p_colaborador_id)
       AND (p_terceiro_id IS NULL OR e.terceiro_id = p_terceiro_id)
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  aud AS (
    SELECT 'auditoria'::text, a.id::text, a."timestamp",
           CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador', 'terceiros', 'terceiro', 'pessoa', 'eventos_jml', 'evento_jml', 'colab_quarentena') THEN 'pessoa'
             WHEN a.entidade IN ('perfil_atribuicoes', 'iam_queue', 'excecoes', 'excecao', 'revisoes', 'revisao', 'sod_conflitos', 'entra_role_members', 'contas_admin_conhecidas') THEN 'acesso'
             WHEN a.entidade IN ('aplicacoes', 'perfis_acesso', 'cargos', 'areas', 'empresas', 'localidades', 'licencas', 'regra', 'sharepoint_sites') THEN 'catalogo'
             ELSE 'sistema' END,
           a.acao,
           a.detalhes->>'pessoa' AS pessoa,
           a.detalhes->>'pessoa_tipo',
           NULL::text, NULL::text, COALESCE(a.operador, 'sistema'), a.entidade,
           left(COALESCE(a.resumo, ''), 200),
           CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/colaboradores/' || a.entidade_id
             WHEN a.entidade IN ('terceiros', 'terceiro') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/terceiros/' || a.entidade_id
             WHEN a.entidade = 'perfil_atribuicoes' AND a.detalhes->>'pessoa_tipo' = 'colaboradores' THEN '/colaboradores/' || (a.detalhes->>'pessoa_id')
             WHEN a.entidade = 'perfil_atribuicoes' AND a.detalhes->>'pessoa_tipo' = 'terceiros' THEN '/terceiros/' || (a.detalhes->>'pessoa_id')
             WHEN a.entidade IN ('revisoes', 'revisao') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/revisoes/' || a.entidade_id
             WHEN a.entidade IN ('excecoes', 'excecao') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/excecoes/' || a.entidade_id
             WHEN a.entidade = 'iam_queue' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/fila-provisionamento/' || a.entidade_id
             WHEN a.entidade IN ('eventos_jml', 'evento_jml') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/eventos-jml/' || a.entidade_id
             WHEN a.entidade = 'aplicacoes' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/aplicacoes/' || a.entidade_id
             WHEN a.entidade = 'perfis_acesso' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/perfis-acesso/' || a.entidade_id
             WHEN a.entidade = 'cargos' THEN '/configuracoes/cargos'
             WHEN a.entidade = 'areas' THEN '/configuracoes/areas'
             WHEN a.entidade = 'empresas' THEN '/configuracoes/empresas'
             WHEN a.entidade = 'localidades' THEN '/configuracoes/localidades'
             WHEN a.entidade = 'licencas' THEN '/licencas'
             WHEN a.entidade = 'parametros' THEN '/configuracoes/parametros'
             WHEN a.entidade IN ('colab_quarentena', 'sync_jobs', 'integracoes') THEN '/configuracoes/integracoes'
             WHEN a.entidade IN ('profiles', 'user_roles', 'usuarios') THEN '/admin/usuarios'
             ELSE '/auditoria' END
      FROM public.auditoria a
     WHERE a.acao NOT IN ('email_revisao', 'enviar_email', 'cron_invoke')
       AND ((SELECT id FROM pid) IS NULL
            OR a.entidade_id = (SELECT id FROM pid)
            OR a.detalhes->>'pessoa_id' = (SELECT id FROM pid)
            OR a.detalhes->>'colaborador_id' = (SELECT id FROM pid)
            OR a.detalhes->>'terceiro_id' = (SELECT id FROM pid))
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  todos AS (
    SELECT * FROM fila UNION ALL SELECT * FROM jml UNION ALL SELECT * FROM aud
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fonte', fonte, 'id', id, 'ts', ts, 'categoria', categoria, 'acao', acao, 'pessoa', pessoa, 'pessoa_tipo', pessoa_tipo,
           'recurso', recurso, 'status', status, 'ator', ator, 'origem', origem, 'detalhe', detalhe, 'link', link)
           ORDER BY ts DESC), '[]'::jsonb)
    FROM (SELECT * FROM todos WHERE p_categoria IS NULL OR categoria = p_categoria ORDER BY ts DESC LIMIT (SELECT n FROM lim)) x;
$$;
REVOKE ALL ON FUNCTION public.dashboard_activity(integer, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity(integer, text, uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ix_auditoria_entidade_id ON public.auditoria (entidade_id);

NOTIFY pgrst, 'reload schema';
