-- =============================================================================
-- IGA hardening (2/7): acesso efetivo + enfileiramento centralizado
--
-- Antes: cinco lugares diferentes (frontend, CSV, expiração de exceção, revisão
-- externa, terceiros) montavam itens de iam_queue por conta própria, e remover
-- um perfil removia recursos que OUTRO perfil ativo ainda concedia.
--
-- Agora: toda geração de assign_*/remove_* passa por iam_enqueue_profile_actions /
-- iam_enqueue_resource_diff, que calculam o acesso efetivo (perfis ativos +
-- concessões individuais) e só removem o que deixou de ser concedido.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guarda de papel: service_role (auth.uid() nulo) ou admin/operador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_assert_operator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- service_role / jobs internos / triggers (sem JWT ou JWT de service_role)
    IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') NOT IN ('service_role', '') THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN;
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Identidade (colaborador ou terceiro) como JSON
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_identity(p_colaborador_id uuid, p_terceiro_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_colaborador_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'colaborador', 'id', c.id, 'nome', c.nome, 'email', c.email,
        'sam', c.sam_account_name, 'entra_id', c.entra_id, 'status', c.status::text,
        'target_identity', COALESCE(c.email, c.sam_account_name))
      FROM colaboradores c WHERE c.id = p_colaborador_id)
    WHEN p_terceiro_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'terceiro', 'id', t.id, 'nome', t.nome, 'email', t.email,
        'sam', NULL, 'entra_id', NULL, 'status', CASE WHEN t.ativo THEN 'ativo' ELSE 'inativo' END,
        'target_identity', t.email)
      FROM terceiros t WHERE t.id = p_terceiro_id)
    ELSE NULL END;
$$;

-- ---------------------------------------------------------------------------
-- Template de recurso → (chave, ações, payload)
-- tipo ∈ grupo | licenca | app | app_interno | sharepoint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_resource_template(
  p_tipo text, p_ref_id uuid, p_pasta_id uuid DEFAULT NULL, p_permissao text DEFAULT NULL, p_perfil_interno_id uuid DEFAULT NULL)
RETURNS TABLE (tipo text, resource_key text, action_assign text, action_remove text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'grupo', 'grupo:' || g.entra_id, 'assign_group', 'remove_group',
         jsonb_build_object('groupId', g.entra_id, 'groupName', g.nome, 'onPremisesSync', COALESCE(g.on_premises_sync, false))
    FROM entra_grupos g WHERE p_tipo = 'grupo' AND g.id = p_ref_id AND g.entra_id IS NOT NULL
  UNION ALL
  SELECT 'licenca', 'licenca:' || l.sku_id, 'assign_license', 'remove_license',
         jsonb_build_object('skuId', l.sku_id, 'licenseName', l.nome)
    FROM entra_licencas l WHERE p_tipo = 'licenca' AND l.id = p_ref_id AND l.sku_id IS NOT NULL
  UNION ALL
  SELECT 'app', 'app:' || a.entra_id, 'assign_app', 'remove_app',
         jsonb_build_object('appId', a.entra_id, 'appName', a.nome,
                            'appRoleId', COALESCE(NULLIF(a.default_app_role_id,''), '00000000-0000-0000-0000-000000000000'))
    FROM aplicacoes a WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.entra_id IS NOT NULL
  UNION ALL
  SELECT 'app_interno', 'app_interno:' || a.id::text || ':' || COALESCE(p_perfil_interno_id::text, ''), 'create_user_app', 'disable_user_app',
         jsonb_build_object('aplicacao_id', a.id, 'appName', a.nome, 'perfil_interno_id', p_perfil_interno_id)
    FROM aplicacoes a WHERE p_tipo = 'app_interno' AND a.id = p_ref_id AND a.integracao_ativa = true AND COALESCE(a.connector_type,'manual') <> 'manual'
  UNION ALL
  SELECT 'sharepoint',
         'sharepoint:' || s.site_id || ':' || COALESCE(p.drive_item_id, '') || ':' || COALESCE(p_permissao, 'leitura'),
         'assign_sharepoint', 'remove_sharepoint',
         jsonb_build_object('resourceType', 'sharepoint', 'siteId', s.site_id, 'siteName', s.nome, 'siteUrl', s.url,
                            'driveItemId', p.drive_item_id, 'folderName', p.nome, 'folderPath', p.caminho,
                            'permission', COALESCE(p_permissao, 'leitura'))
    FROM sharepoint_sites s LEFT JOIN sharepoint_pastas p ON p.id = p_pasta_id
   WHERE p_tipo = 'sharepoint' AND s.id = p_ref_id AND s.site_id IS NOT NULL;
$$;

-- Recursos concedidos por um conjunto de perfis
CREATE OR REPLACE FUNCTION public.iam_profile_resources(p_perfil_ids uuid[])
RETURNS TABLE (perfil_id uuid, tipo text, resource_key text, action_assign text, action_remove text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg.perfil_id, t.* FROM perfil_grupos pg, LATERAL iam_resource_template('grupo', pg.grupo_id) t
   WHERE pg.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pl.perfil_id, t.* FROM perfil_licencas pl, LATERAL iam_resource_template('licenca', pl.licenca_id) t
   WHERE pl.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pa.perfil_id, t.* FROM perfil_aplicacoes pa, LATERAL iam_resource_template('app', pa.aplicacao_id) t
   WHERE pa.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pai.perfil_id, t.* FROM perfil_apps_internos pai, LATERAL iam_resource_template('app_interno', pai.aplicacao_id, NULL, NULL, pai.perfil_interno_id) t
   WHERE pai.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT ps.perfil_id, t.* FROM perfil_sharepoint ps,
         LATERAL iam_resource_template('sharepoint', ps.site_id, COALESCE(ps.pasta_nivel2_id, ps.pasta_nivel1_id), ps.permissao) t
   WHERE ps.perfil_id = ANY (p_perfil_ids);
$$;

-- Perfis ativos de uma identidade (materializados em perfil_atribuicoes, inclui origem cargo)
CREATE OR REPLACE FUNCTION public.iam_active_perfil_ids(p_colaborador_id uuid, p_terceiro_id uuid, p_exclude uuid[] DEFAULT '{}')
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT pa.perfil_id), '{}'::uuid[])
    FROM perfil_atribuicoes pa
    JOIN perfis_acesso p ON p.id = pa.perfil_id AND p.ativo = true
   WHERE pa.ativo = true
     AND ((p_colaborador_id IS NOT NULL AND pa.colaborador_id = p_colaborador_id)
       OR (p_terceiro_id IS NOT NULL AND pa.terceiro_id = p_terceiro_id))
     AND NOT (pa.perfil_id = ANY (COALESCE(p_exclude, '{}'::uuid[])));
$$;

-- Chave de recurso derivada de um item da fila (compatível com itens antigos sem resource_key)
CREATE OR REPLACE FUNCTION public.iam_queue_resource_key(p_action text, p_payload jsonb, p_resource_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_resource_key, CASE
    WHEN p_action IN ('assign_group','remove_group')       THEN 'grupo:'   || (p_payload->>'groupId')
    WHEN p_action IN ('assign_license','remove_license')   THEN 'licenca:' || (p_payload->>'skuId')
    WHEN p_action IN ('assign_app','remove_app') AND COALESCE(p_payload->>'resourceType','') <> 'sharepoint'
                                                           THEN 'app:'     || (p_payload->>'appId')
    WHEN p_action IN ('assign_sharepoint','remove_sharepoint') OR COALESCE(p_payload->>'resourceType','') = 'sharepoint'
                                                           THEN 'sharepoint:' || (p_payload->>'siteId') || ':' || COALESCE(p_payload->>'driveItemId','') || ':' || COALESCE(p_payload->>'permission','leitura')
    WHEN p_action IN ('create_user_app','disable_user_app','delete_user_app')
                                                           THEN 'app_interno:' || (p_payload->>'aplicacao_id') || ':' || COALESCE(p_payload->>'perfil_interno_id','')
    ELSE NULL END);
$$;

-- Concessões individuais vigentes (ledger da fila): último assign_* com sucesso
-- de origem manual_individual/entra_sync sem remove_* posterior com sucesso.
CREATE OR REPLACE FUNCTION public.iam_individual_resources(p_colaborador_id uuid, p_terceiro_id uuid)
RETURNS TABLE (resource_key text, action_assign text, action_remove text, payload jsonb, requested_by text, target_identity text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH itens AS (
    SELECT q.*, iam_queue_resource_key(q.action_type, q.payload_json, q.resource_key) AS rk
      FROM iam_queue q
     WHERE q.status = 'success'
       AND ((p_colaborador_id IS NOT NULL AND q.colaborador_id = p_colaborador_id)
         OR (p_terceiro_id IS NOT NULL AND q.terceiro_id = p_terceiro_id))
       AND (q.action_type LIKE 'assign\_%' OR q.action_type LIKE 'remove\_%')
  ), ultimos AS (
    SELECT DISTINCT ON (rk) *
      FROM itens
     WHERE rk IS NOT NULL
     ORDER BY rk, COALESCE(processed_at, created_at) DESC
  )
  SELECT u.rk, u.action_type, replace(u.action_type, 'assign_', 'remove_'), u.payload_json, u.requested_by, u.target_identity
    FROM ultimos u
   WHERE u.action_type LIKE 'assign\_%'
     AND u.requested_by IN ('manual_individual', 'entra_sync');
$$;

-- ---------------------------------------------------------------------------
-- Inserção de um item da fila (sempre com identidade e resource_key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_insert(
  p_identity jsonb, p_action text, p_payload jsonb, p_resource_key text,
  p_requested_by text, p_status text DEFAULT 'pending', p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab uuid := CASE WHEN p_identity->>'tipo' = 'colaborador' THEN (p_identity->>'id')::uuid END;
  v_terc  uuid := CASE WHEN p_identity->>'tipo' = 'terceiro'    THEN (p_identity->>'id')::uuid END;
  v_status text := COALESCE(p_status, 'pending');
  v_onprem boolean := COALESCE((p_payload->>'onPremisesSync')::boolean, false) AND p_action = 'assign_group';
  v_rows int;
BEGIN
  IF p_identity IS NULL THEN RETURN false; END IF;
  INSERT INTO public.iam_queue (
    action_type, status, colaborador_id, terceiro_id, target_identity, requested_by, resource_key, payload_json,
    error_code, result_message, processed_at, processed_by)
  VALUES (
    p_action,
    CASE WHEN v_onprem THEN 'failed' ELSE v_status END,
    v_colab, v_terc,
    p_identity->>'target_identity',
    p_requested_by,
    p_resource_key,
    p_payload
      || jsonb_build_object('displayName', p_identity->>'nome', 'mail', p_identity->>'email',
                            'samAccountName', p_identity->>'sam', 'entra_id', p_identity->>'entra_id')
      || COALESCE(p_extra, '{}'::jsonb),
    CASE WHEN v_onprem THEN 'on_premises_managed' END,
    CASE WHEN v_onprem THEN 'Grupo "' || COALESCE(p_payload->>'groupName', p_payload->>'groupId') || '" é gerenciado pelo AD local' END,
    CASE WHEN v_onprem THEN now() END,
    CASE WHEN v_onprem THEN 'sistema' END)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enfileira assign/remove de PERFIS inteiros para uma identidade
--   remove: só recursos que nenhum outro perfil ativo (nem concessão individual) concede
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_profile_actions(
  p_colaborador_id uuid, p_terceiro_id uuid, p_perfil_ids uuid[], p_mode text,
  p_requested_by text, p_status text DEFAULT 'pending', p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      jsonb;
  v_n       int := 0;
  v_res     record;
  v_keep    text[];
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_mode NOT IN ('assign','remove') THEN RAISE EXCEPTION 'p_mode deve ser assign|remove'; END IF;
  IF COALESCE(array_length(p_perfil_ids, 1), 0) = 0 THEN RETURN 0; END IF;

  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN 0; END IF;
  IF COALESCE(v_id->>'email','') = '' AND COALESCE(v_id->>'sam','') = '' THEN
    INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Identidade sem e-mail/SAM',
            format('%s não tem e-mail nem samAccountName — %s de perfil não pôde ser enfileirado.', v_id->>'nome', p_mode),
            'aviso', 'identidade_incompleta', v_id->>'tipo', v_id->>'id',
            CASE WHEN v_id->>'tipo' = 'colaborador' THEN '/colaboradores/' ELSE '/terceiros/' END || (v_id->>'id'));
    RETURN 0;
  END IF;

  IF p_mode = 'remove' THEN
    -- recursos que continuam concedidos por outros perfis ativos ou individualmente
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_keep FROM (
      SELECT r.resource_key AS k
        FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id, p_perfil_ids)) r
      UNION
      SELECT i.resource_key FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i
    ) s;
  END IF;

  FOR v_res IN
    SELECT DISTINCT ON (resource_key) resource_key, action_assign, action_remove, payload, perfil_id
      FROM public.iam_profile_resources(p_perfil_ids)
     ORDER BY resource_key
  LOOP
    IF p_mode = 'remove' AND v_res.resource_key = ANY (COALESCE(v_keep, '{}')) THEN
      CONTINUE; -- ainda concedido por outro caminho
    END IF;
    IF public.iam_queue_insert(
         v_id,
         CASE WHEN p_mode = 'assign' THEN v_res.action_assign ELSE v_res.action_remove END,
         v_res.payload, v_res.resource_key, p_requested_by, p_status,
         jsonb_build_object('perfil_id', v_res.perfil_id, 'reason', COALESCE(p_motivo, 'perfil_' || p_mode)))
    THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enfileira um DIFF de recursos avulsos (edição da composição de um perfil,
-- concessão/remoção individual, aprovação de solicitação)
--   p_added / p_removed: [{"tipo":"grupo|licenca|app|app_interno|sharepoint","id":uuid,"pasta_id":uuid,"permissao":text,"perfil_interno_id":uuid}]
--   p_exclude_perfil_ids: perfil cuja composição está sendo editada (não conta como "ainda concede")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_resource_diff(
  p_colaborador_id uuid, p_terceiro_id uuid,
  p_added jsonb DEFAULT '[]'::jsonb, p_removed jsonb DEFAULT '[]'::jsonb,
  p_requested_by text DEFAULT 'sistema', p_status text DEFAULT 'pending',
  p_motivo text DEFAULT NULL, p_exclude_perfil_ids uuid[] DEFAULT '{}', p_check_individual boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   jsonb;
  v_n    int := 0;
  v_item jsonb;
  v_res  record;
  v_keep text[] := '{}';
BEGIN
  PERFORM public.iam_assert_operator();
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN 0; END IF;
  IF COALESCE(v_id->>'email','') = '' AND COALESCE(v_id->>'sam','') = '' THEN RETURN 0; END IF;

  IF jsonb_array_length(COALESCE(p_removed, '[]'::jsonb)) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_keep FROM (
      SELECT r.resource_key AS k
        FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id, p_exclude_perfil_ids)) r
      UNION
      SELECT i.resource_key FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i WHERE p_check_individual
    ) s;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_added, '[]'::jsonb)) LOOP
    FOR v_res IN
      SELECT * FROM public.iam_resource_template(
        v_item->>'tipo', (v_item->>'id')::uuid, NULLIF(v_item->>'pasta_id','')::uuid,
        v_item->>'permissao', NULLIF(v_item->>'perfil_interno_id','')::uuid)
    LOOP
      IF public.iam_queue_insert(v_id, v_res.action_assign, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                                 jsonb_build_object('reason', COALESCE(p_motivo, 'diff_assign')))
      THEN v_n := v_n + 1; END IF;
    END LOOP;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_removed, '[]'::jsonb)) LOOP
    FOR v_res IN
      SELECT * FROM public.iam_resource_template(
        v_item->>'tipo', (v_item->>'id')::uuid, NULLIF(v_item->>'pasta_id','')::uuid,
        v_item->>'permissao', NULLIF(v_item->>'perfil_interno_id','')::uuid)
    LOOP
      IF v_res.resource_key = ANY (v_keep) THEN CONTINUE; END IF;
      IF public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                                 jsonb_build_object('reason', COALESCE(p_motivo, 'diff_remove')))
      THEN v_n := v_n + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Remoção de TODAS as concessões individuais vigentes (leaver)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_individual_removals(
  p_colaborador_id uuid, p_terceiro_id uuid, p_requested_by text, p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   jsonb;
  v_n    int := 0;
  v_res  record;
  v_snap jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('enfileirados', 0, 'snapshot', '[]'::jsonb); END IF;

  FOR v_res IN SELECT * FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) LOOP
    v_snap := v_snap || jsonb_build_object('action_type', v_res.action_assign, 'payload_json', v_res.payload,
                                           'target_identity', v_res.target_identity, 'requested_by', v_res.requested_by,
                                           'resource_key', v_res.resource_key);
    IF public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                               jsonb_build_object('reason', 'remocao_individual_leaver'))
    THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('enfileirados', v_n, 'snapshot', v_snap);
END;
$$;

-- ---------------------------------------------------------------------------
-- Visão de acesso efetivo (para telas/relatórios/recertificação)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_effective_access(p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL)
RETURNS TABLE (origem text, perfil_id uuid, tipo text, resource_key text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'perfil', r.perfil_id, r.tipo, r.resource_key, r.payload
    FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id)) r
  UNION ALL
  SELECT 'individual', NULL, split_part(i.resource_key, ':', 1), i.resource_key, i.payload
    FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.iam_assert_operator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_identity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_resource_template(text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_profile_resources(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_active_perfil_ids(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_individual_resources(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_queue_insert(jsonb, text, jsonb, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iam_enqueue_profile_actions(uuid, uuid, uuid[], text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_enqueue_resource_diff(uuid, uuid, jsonb, jsonb, text, text, text, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_enqueue_individual_removals(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_effective_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_identity(uuid, uuid), public.iam_resource_template(text, uuid, uuid, text, uuid),
  public.iam_profile_resources(uuid[]), public.iam_active_perfil_ids(uuid, uuid, uuid[]),
  public.iam_individual_resources(uuid, uuid), public.iam_enqueue_profile_actions(uuid, uuid, uuid[], text, text, text, text),
  public.iam_enqueue_resource_diff(uuid, uuid, jsonb, jsonb, text, text, text, uuid[], boolean),
  public.iam_enqueue_individual_removals(uuid, uuid, text, text), public.iam_effective_access(uuid, uuid),
  public.iam_assert_operator()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_queue_insert(jsonb, text, jsonb, text, text, text, jsonb) TO service_role;
