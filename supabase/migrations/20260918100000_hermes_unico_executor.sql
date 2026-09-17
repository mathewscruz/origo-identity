-- =============================================================================
-- Hermes/Órigo Agente como ÚNICO executor + limpeza de opções de teste
--
-- 1. Só o agente executa (AD, Entra, SharePoint, apps, reset de senha):
--    - parâmetros iam_execution_mode / modo_operacao (simulação) deixam de existir
--    - job origo-process-queue (process-iam-queue) sai da agenda
--    - iam_cron_invoke sem a exceção de simulação
--    - tabela iam_agent_status (heartbeat do agente → dashboard)
--    - reset de senha vira item da fila (iam_enqueue_reset_password) executado pelo agente
-- 2. Remoção de opções/dados de teste: parâmetros do scaffold (2Easy, dupla aprovação…),
--    dados de demonstração da migration inicial (UUIDs fixos), tabelas nunca escritas
--    (evento_jml_acoes / evento_jml_aprovacoes), funções órfãs.
-- 3. Fluxos que ainda rodavam no navegador viram RPCs transacionais:
--    colaborador_salvar, terceiro_salvar, excecao_decidir, iam_revogar_individual,
--    iam_queue_reprocessar_falhas, dashboard_metrics, iam_queue_stats.
-- Tudo idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Parâmetros: remove opções de teste/legado, garante os reais com descrição
-- ---------------------------------------------------------------------------
DELETE FROM public.parametros
 WHERE chave IN ('iam_execution_mode', 'modo_operacao', 'max_tentativas_jml',
                 'aprovacao_dupla_leaver', 'importacao_automatica', 'dias_alerta_contrato');

INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('iam_approval_required', 'true', 'Exigir aprovação manual antes de qualquer ação ir para o agente executor'),
  ('iam_enable_requires_approval', 'true', 'Reabilitação de conta (retorno, reversão de pré-leaver, recontratação) sempre exige aprovação'),
  ('mover_remocao_modo', 'aprovacao', 'Mover: o que fazer com acessos exclusivos do cargo anterior (aprovacao | imediato | nenhum)'),
  ('csv_leaver_limite_pct', '5', 'Importação RH: percentual máximo de desligamentos por arquivo (base ≥ 20 ativos)'),
  ('csv_leaver_limite_abs', '50', 'Importação RH: número máximo absoluto de desligamentos por arquivo'),
  ('csv_email_dominio', 'origoenergia.com.br', 'Domínio do e-mail corporativo gerado para novos colaboradores'),
  ('csv_gerar_email_corporativo', 'true', 'Gerar e-mail corporativo quando o RH não informa um e-mail do domínio'),
  ('ad_upn_dominio', 'ebessolar.local', 'Domínio UPN das contas criadas no Active Directory'),
  ('sharepoint_rh_site', 'origoenergia.sharepoint.com:/sites/dataanalytics', 'Site SharePoint onde o RH publica a base'),
  ('sharepoint_rh_pasta', 'RH_COLAB', 'Pasta (dentro de Documentos) com os arquivos do RH'),
  ('sharepoint_rh_prefixo', 'base_colab_', 'Prefixo do nome do arquivo CSV do RH'),
  ('licenca_critico_pct', '90', 'Percentual de uso a partir do qual uma licença é considerada crítica'),
  ('priv_role_max_membros', '3', 'Máximo recomendado de membros em uma role privilegiada antes de alertar'),
  ('revisao_periodicidade_dias', '90', 'Periodicidade (dias) das revisões automáticas de acesso por aplicação'),
  ('terceiro_revalidacao_dias', '45', 'Dias sem revalidação após os quais o responsável por um terceiro é notificado'),
  ('terceiro_email_dominio', 'parceiroorigoenergia.com.br', 'Domínio do e-mail gerado para terceiros'),
  ('iam_orphan_ignore_prefixes', 'svc.,admin.,test.,sa.,adm.,notif.,noreply,sync.', 'Prefixos de UPN ignorados na detecção de contas órfãs no Entra'),
  ('entra_roles_last_sync', '', 'Sistema: timestamp da última sincronização de roles privilegiadas')
ON CONFLICT (chave) DO UPDATE SET descricao = EXCLUDED.descricao;

-- ---------------------------------------------------------------------------
-- 2. Agenda: process-iam-queue não existe mais; sem modo simulação
-- ---------------------------------------------------------------------------
DO $$
DECLARE j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'origo-process-queue' LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_cron_invoke(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
  v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'origo_functions_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'origo_service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'iam_cron_invoke(%): segredos origo_functions_url/origo_service_role_key ausentes no Vault — job ignorado', p_function;
    RETURN NULL;
  END IF;
  SELECT net.http_post(
           url     := rtrim(v_url, '/') || '/' || p_function,
           headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'apikey', v_key),
           body    := COALESCE(p_body, '{}'::jsonb),
           timeout_milliseconds := 120000)
    INTO v_req;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('cron_invoke', 'scheduler', 'pg_cron', 'Job agendado disparou ' || p_function, jsonb_build_object('request_id', v_req, 'body', p_body));
  RETURN v_req;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Objetos mortos
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.evento_jml_acoes CASCADE;       -- só o seed de demo escrevia
DROP TABLE IF EXISTS public.evento_jml_aprovacoes CASCADE;  -- idem
DROP FUNCTION IF EXISTS public.cleanup_expired_iam_change_backups();
DROP FUNCTION IF EXISTS public.iam_backup_actor();
DROP FUNCTION IF EXISTS public.has_any_app_role(uuid);
DO $$
DECLARE v_n int;
BEGIN
  IF to_regclass('public.iam_change_backups') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.iam_change_backups' INTO v_n;
    IF v_n = 0 THEN
      EXECUTE 'DROP TABLE public.iam_change_backups';
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Dados de demonstração do scaffold (UUIDs fixos da migration inicial).
--    Só remove as linhas exatamente com esses ids — nada criado pelo uso real.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_colabs uuid[] := ARRAY['f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003',
                           'f0000000-0000-0000-0000-000000000004','f0000000-0000-0000-0000-000000000005','f0000000-0000-0000-0000-000000000006']::uuid[];
  v_tercs  uuid[] := ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003']::uuid[];
  v_apps   uuid[] := ARRAY['80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003',
                           '80000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000006',
                           '80000000-0000-0000-0000-000000000007']::uuid[];
  v_perfis uuid[] := ARRAY['90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003',
                           '90000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000005','90000000-0000-0000-0000-000000000006']::uuid[];
  v_revs   uuid[] := ARRAY['cc000000-0000-0000-0000-000000000001','cc000000-0000-0000-0000-000000000002']::uuid[];
  v_evs    uuid[] := ARRAY['bb000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000002','bb000000-0000-0000-0000-000000000003',
                           'bb000000-0000-0000-0000-000000000004','bb000000-0000-0000-0000-000000000005']::uuid[];
  v_n int := 0; v_t int;
BEGIN
  PERFORM set_config('origo.allow_hard_delete', 'on', true);
  DELETE FROM public.revisao_itens WHERE revisao_id = ANY (v_revs) OR colaborador_id = ANY (v_colabs) OR perfil_id = ANY (v_perfis);
  DELETE FROM public.revisoes WHERE id = ANY (v_revs);
  DELETE FROM public.excecoes WHERE colaborador_id = ANY (v_colabs) OR perfil_id = ANY (v_perfis);
  DELETE FROM public.eventos_jml WHERE id = ANY (v_evs) OR colaborador_id = ANY (v_colabs);
  DELETE FROM public.perfil_atribuicoes WHERE colaborador_id = ANY (v_colabs) OR terceiro_id = ANY (v_tercs) OR perfil_id = ANY (v_perfis);
  DELETE FROM public.iam_queue WHERE colaborador_id = ANY (v_colabs) OR terceiro_id = ANY (v_tercs);
  DELETE FROM public.licencas WHERE aplicacao_id = ANY (v_apps) AND nome IN ('Microsoft 365 E3','SAP ERP User','Jira Cloud Standard','Slack Business+','AWS Reserved','Datadog Pro');
  DELETE FROM public.colaboradores WHERE id = ANY (v_colabs) AND email LIKE '%@origo.com';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  DELETE FROM public.terceiros WHERE id = ANY (v_tercs);
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  DELETE FROM public.perfis_acesso WHERE id = ANY (v_perfis);
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  DELETE FROM public.aplicacoes WHERE id = ANY (v_apps) AND COALESCE(origem, 'manual') <> 'azure';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  PERFORM set_config('origo.allow_hard_delete', 'off', true);
  IF v_n > 0 THEN
    INSERT INTO public.auditoria (acao, entidade, operador, resumo)
    VALUES ('limpeza_dados_demo', 'sistema', 'migration', format('%s registro(s) de demonstração do scaffold removidos', v_n));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Identidade de terceiro com SAM (terceiros.sam_account_name existe desde 20260917120200)
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
        'sam', t.sam_account_name, 'entra_id', NULL, 'status', CASE WHEN t.ativo THEN 'ativo' ELSE 'inativo' END,
        'target_identity', COALESCE(t.email, t.sam_account_name))
      FROM terceiros t WHERE t.id = p_terceiro_id)
    ELSE NULL END;
$$;

-- eventos de terceiro passam a ter FK própria (antes só dentro de dados_antes)
ALTER TABLE public.eventos_jml ADD COLUMN IF NOT EXISTS terceiro_id uuid REFERENCES public.terceiros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eventos_jml_terceiro ON public.eventos_jml (terceiro_id) WHERE terceiro_id IS NOT NULL;
UPDATE public.eventos_jml e
   SET terceiro_id = (e.dados_antes->>'terceiro_id')::uuid
 WHERE e.terceiro_id IS NULL AND e.colaborador_id IS NULL
   AND e.dados_antes ? 'terceiro_id'
   AND EXISTS (SELECT 1 FROM public.terceiros t WHERE t.id::text = e.dados_antes->>'terceiro_id');
CREATE OR REPLACE FUNCTION public.eventos_jml_fill_terceiro()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.terceiro_id IS NULL AND NEW.colaborador_id IS NULL AND NEW.dados_antes ? 'terceiro_id' THEN
    SELECT t.id INTO NEW.terceiro_id FROM public.terceiros t WHERE t.id::text = NEW.dados_antes->>'terceiro_id';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_eventos_jml_fill_terceiro ON public.eventos_jml;
CREATE TRIGGER trg_eventos_jml_fill_terceiro BEFORE INSERT ON public.eventos_jml
  FOR EACH ROW EXECUTE FUNCTION public.eventos_jml_fill_terceiro();

-- ---------------------------------------------------------------------------
-- 6. Heartbeat do agente executor (alimentado pela iam-agent-api)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iam_agent_status (
  owner          text PRIMARY KEY,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_claim_at  timestamptz,
  last_result_at timestamptz,
  last_result    text,
  version        text,
  host           text,
  execute_mode   boolean,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.iam_agent_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view agent status" ON public.iam_agent_status;
CREATE POLICY "Authenticated can view agent status" ON public.iam_agent_status FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.iam_agent_status TO authenticated;
GRANT ALL ON public.iam_agent_status TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iam_agent_status') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iam_agent_status;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_agent_heartbeat(p_owner text, p_kind text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.iam_agent_status (owner, last_seen_at, last_claim_at, last_result_at, last_result, version, host, execute_mode, details)
  VALUES (COALESCE(p_owner, 'origo-agent'), now(),
          CASE WHEN p_kind = 'claim'  THEN now() END,
          CASE WHEN p_kind = 'result' THEN now() END,
          CASE WHEN p_kind = 'result' THEN p_details->>'result' END,
          p_details->>'version', p_details->>'host', (p_details->>'execute')::boolean, COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (owner) DO UPDATE SET
    last_seen_at   = now(),
    last_claim_at  = CASE WHEN p_kind = 'claim'  THEN now() ELSE iam_agent_status.last_claim_at END,
    last_result_at = CASE WHEN p_kind = 'result' THEN now() ELSE iam_agent_status.last_result_at END,
    last_result    = CASE WHEN p_kind = 'result' THEN p_details->>'result' ELSE iam_agent_status.last_result END,
    version        = COALESCE(p_details->>'version', iam_agent_status.version),
    host           = COALESCE(p_details->>'host', iam_agent_status.host),
    execute_mode   = COALESCE((p_details->>'execute')::boolean, iam_agent_status.execute_mode),
    details        = iam_agent_status.details || COALESCE(p_details, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Reset de senha como item da fila (executado pelo agente; a senha temporária
--    nunca é gravada — a API a entrega por e-mail ao solicitante)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_reset_password(
  p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_id     jsonb;
  v_priv   boolean := false;
  v_target text;
  v_key    text;
  v_item   uuid;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade não encontrada'); END IF;
  v_target := NULLIF(v_id->>'target_identity', '');
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade sem e-mail/login — não há conta para resetar'); END IF;
  IF COALESCE(v_email, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reset de senha exige um usuário logado (a senha temporária é enviada ao seu e-mail)');
  END IF;

  -- contas privilegiadas (roles do Entra / admins conhecidos): só admin do app
  IF v_id->>'entra_id' IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.entra_role_members WHERE user_entra_id = v_id->>'entra_id')
        OR EXISTS (SELECT 1 FROM public.contas_admin_conhecidas WHERE entra_id = v_id->>'entra_id') INTO v_priv;
  END IF;
  IF NOT v_priv AND v_id->>'email' IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.entra_role_members WHERE lower(user_email) = lower(v_id->>'email'))
        OR EXISTS (SELECT 1 FROM public.contas_admin_conhecidas WHERE lower(email) = lower(v_id->>'email')) INTO v_priv;
  END IF;
  IF v_priv AND NOT public.has_role(v_uid, 'admin') THEN
    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
    VALUES ('reset_senha_negado', COALESCE(v_id->>'tipo','colaboradores'), v_id->>'id', v_email,
            format('Reset de senha de conta privilegiada (%s) negado: requer admin', v_id->>'nome'));
    RETURN jsonb_build_object('ok', false, 'error', 'Conta privilegiada: reset de senha requer papel admin');
  END IF;

  v_key := 'password:' || v_target;
  IF EXISTS (SELECT 1 FROM public.iam_queue q WHERE q.action_type = 'reset_password' AND q.resource_key = v_key
              AND q.status IN ('pending','waiting_approval','processing')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe um reset de senha em andamento para esta conta');
  END IF;

  INSERT INTO public.iam_queue (action_type, status, colaborador_id, terceiro_id, target_identity, requested_by, resource_key, payload_json)
  VALUES ('reset_password', 'pending',
          CASE WHEN v_id->>'tipo' = 'colaborador' THEN (v_id->>'id')::uuid END,
          CASE WHEN v_id->>'tipo' = 'terceiro' THEN (v_id->>'id')::uuid END,
          v_target, v_email, v_key,
          jsonb_build_object('reason', COALESCE(p_motivo, 'reset_senha'),
                             'displayName', v_id->>'nome', 'mail', v_id->>'email', 'samAccountName', v_id->>'sam', 'entra_id', v_id->>'entra_id',
                             'forceChangePasswordNextSignIn', true, 'deliver_to', v_email, 'privilegiada', v_priv))
  RETURNING id INTO v_item;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('reset_senha_solicitado', COALESCE(v_id->>'tipo','colaboradores'), v_id->>'id', v_email,
          format('Reset de senha solicitado para %s (%s) — executado pelo agente; senha temporária vai para %s', v_id->>'nome', v_target, v_email),
          jsonb_build_object('item_id', v_item, 'motivo', p_motivo, 'privilegiada', v_priv));
  RETURN jsonb_build_object('ok', true, 'item_id', v_item, 'deliver_to', v_email);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_enqueue_reset_password(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_enqueue_reset_password(uuid, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Revogar uma concessão individual respeitando o acesso efetivo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_revogar_individual(
  p_colaborador_id uuid, p_terceiro_id uuid, p_resource_key text, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    jsonb;
  v_res   record;
  v_perfil text;
  v_ok    boolean;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade não encontrada'); END IF;

  SELECT * INTO v_res FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) WHERE resource_key = p_resource_key;
  IF v_res.resource_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Concessão individual não encontrada (ou já removida)');
  END IF;

  -- ainda concedido por um perfil ativo? então a "individual" é redundante — não remove
  SELECT pa.nome INTO v_perfil
    FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id)) r
    JOIN public.perfis_acesso pa ON pa.id = r.perfil_id
   WHERE r.resource_key = p_resource_key LIMIT 1;
  IF v_perfil IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Recurso ainda concedido pelo perfil "%s" — revogue o perfil ou ajuste sua composição', v_perfil));
  END IF;

  IF v_res.action_assign = 'assign_group' THEN
    IF COALESCE((v_res.payload->>'onPremisesSync')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo sincronizado do AD local — remova a associação no Active Directory');
    END IF;
    IF COALESCE((v_res.payload->>'dynamicMembership')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo dinâmico do Entra — ajuste a regra/atributos, não a associação');
    END IF;
    IF COALESCE((v_res.payload->>'isAssignableToRole')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo privilegiado (role-assignable) — governança administrativa específica');
    END IF;
  END IF;

  v_ok := public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, p_resource_key, 'manual_individual', 'pending',
                                  jsonb_build_object('reason', COALESCE(p_motivo, 'revogacao_individual'), 'operador', v_email));
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe uma remoção aberta para este recurso');
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('revogar_individual', 'iam_queue', v_id->>'id', COALESCE(v_email, 'sistema'),
          format('Recurso individual %s revogado para %s', p_resource_key, v_id->>'nome'),
          jsonb_build_object('resource_key', p_resource_key, 'motivo', p_motivo, 'origem_concessao', v_res.requested_by));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_revogar_individual(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_revogar_individual(uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Decisão de exceção (transacional, anti-auto-aprovação, provisiona via acesso efetivo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excecao_decidir(p_id uuid, p_decisao text, p_comentario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_nome  text;
  v_e     excecoes%ROWTYPE;
  v_q     int := 0;
  v_st    text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_decisao NOT IN ('aprovada', 'rejeitada') THEN RAISE EXCEPTION 'Decisão inválida: %', p_decisao; END IF;
  SELECT email, nome INTO v_email, v_nome FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_e FROM public.excecoes WHERE id = p_id FOR UPDATE;
  IF v_e.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Exceção não encontrada'); END IF;
  IF v_e.status::text <> 'pendente' THEN RETURN jsonb_build_object('ok', false, 'error', 'Exceção já decidida'); END IF;
  IF v_email IS NOT NULL AND (lower(v_e.solicitante) = lower(v_email) OR lower(v_e.solicitante) = lower(COALESCE(v_nome, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auto-aprovação não permitida: quem solicitou não pode decidir a exceção');
  END IF;

  UPDATE public.excecoes
     SET status = p_decisao::status_excecao, data_decisao = now(), aprovador = COALESCE(v_nome, v_email, 'sistema')
   WHERE id = p_id;

  IF p_decisao = 'aprovada' AND COALESCE(v_e.tipo_excecao, 'acesso') = 'acesso' AND v_e.colaborador_id IS NOT NULL AND v_e.perfil_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.perfil_atribuicoes WHERE colaborador_id = v_e.colaborador_id AND perfil_id = v_e.perfil_id AND ativo) THEN
      INSERT INTO public.perfil_atribuicoes (colaborador_id, perfil_id, origem, excecao_id, ativo)
      VALUES (v_e.colaborador_id, v_e.perfil_id, 'excecao', p_id, true);
    END IF;
    v_q := public.iam_enqueue_profile_actions(v_e.colaborador_id, NULL, ARRAY[v_e.perfil_id], 'assign',
                                              COALESCE(v_email, 'excecao_aprovada'), 'pending', 'excecao:' || p_id::text);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES (CASE WHEN p_decisao = 'aprovada' THEN 'aprovar_excecao' ELSE 'rejeitar_excecao' END, 'excecoes', p_id::text,
          COALESCE(v_email, 'sistema'),
          format('Exceção (%s) %s para %s%s', COALESCE(v_e.tipo_excecao, 'acesso'), p_decisao, COALESCE(v_e.colaborador_nome, '—'),
                 CASE WHEN p_comentario IS NOT NULL THEN ': ' || p_comentario ELSE '' END),
          jsonb_build_object('comentario', p_comentario, 'perfil_id', v_e.perfil_id, 'enfileirados', v_q));
  RETURN jsonb_build_object('ok', true, 'enfileirados', v_q, 'solicitante', v_e.solicitante);
END;
$$;
REVOKE ALL ON FUNCTION public.excecao_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excecao_decidir(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Cadastro manual de colaborador — criação/edição com ciclo de vida completo
--     (antes: ~10 escritas no navegador, senha fixa no payload, evento duplicado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.colaborador_salvar(p_id uuid, p_dados jsonb, p_operador text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_op      text;
  v_old     colaboradores%ROWTYPE;
  v_id      uuid := p_id;
  v_nome    text := NULLIF(trim(p_dados->>'nome'), '');
  v_email   text := NULLIF(lower(trim(p_dados->>'email')), '');
  v_sam     text := NULLIF(trim(p_dados->>'sam_account_name'), '');
  v_status  text := COALESCE(NULLIF(p_dados->>'status',''), 'ativo');
  v_cargo   uuid := NULLIF(p_dados->>'cargo_id','')::uuid;
  v_area    uuid := NULLIF(p_dados->>'area_id','')::uuid;
  v_emp     uuid := NULLIF(p_dados->>'empresa_id','')::uuid;
  v_loc     uuid := NULLIF(p_dados->>'localidade_id','')::uuid;
  v_gestor  uuid := NULLIF(p_dados->>'gestor_id','')::uuid;
  v_adm     date := NULLIF(p_dados->>'data_admissao','')::date;
  v_upn_dom text := COALESCE(public.iam_param('ad_upn_dominio', 'ebessolar.local'), 'ebessolar.local');
  v_ident   jsonb;
  v_res     jsonb := '{}'::jsonb;
  v_r       jsonb;
  v_changed text[] := '{}';
  v_newvals jsonb := '{}'::jsonb;
  v_parts   text[];
  v_start   timestamptz := now();  -- created_at usa now() (início da transação)
  v_criado  boolean := (p_id IS NULL);
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = v_uid;
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nome é obrigatório'); END IF;
  IF v_status NOT IN ('ativo','inativo','ferias','afastado','desligado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || v_status);
  END IF;

  IF v_criado THEN
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(email) = v_email) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um colaborador com este e-mail');
    END IF;
    IF v_sam IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(sam_account_name) = lower(v_sam)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um colaborador com este login AD');
    END IF;
    INSERT INTO public.colaboradores (nome, email, cpf, matricula, sam_account_name, status, empresa_id, area_id, cargo_id, localidade_id, gestor_id, data_admissao, origem)
    VALUES (v_nome, v_email, NULLIF(trim(p_dados->>'cpf'),''), NULLIF(trim(p_dados->>'matricula'),''), v_sam, v_status::status_colaborador,
            v_emp, v_area, v_cargo, v_loc, v_gestor, v_adm, 'manual')
    RETURNING id INTO v_id;
    v_ident := public.iam_identity(v_id, NULL);

    INSERT INTO public.eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_depois)
    VALUES ('joiner', 'executado', v_id, v_nome, 'manual',
            jsonb_build_object('cargo_id', v_cargo, 'area_id', v_area, 'empresa_id', v_emp, 'status', v_status, 'operador', v_op));

    -- conta AD (o agente define a senha inicial; nada de senha no payload)
    IF v_status = 'ativo' AND v_sam IS NOT NULL THEN
      v_parts := regexp_split_to_array(v_nome, '\s+');
      PERFORM public.iam_queue_insert(v_ident, 'create',
        jsonb_build_object('givenName', v_parts[1], 'surname', COALESCE(NULLIF(array_to_string(v_parts[2:], ' '), ''), v_parts[1]),
                           'userPrincipalName', v_sam || '@' || v_upn_dom, 'employeeID', NULLIF(trim(p_dados->>'matricula'),''),
                           'department', (SELECT nome FROM public.areas WHERE id = v_area),
                           'title', (SELECT nome FROM public.cargos WHERE id = v_cargo),
                           'company', (SELECT nome FROM public.empresas WHERE id = v_emp),
                           'changePasswordAtLogon', true, 'reason', 'joiner_manual'),
        'ad_account:' || v_sam, v_op, 'pending');
      v_res := v_res || jsonb_build_object('conta_enfileirada', true);
    END IF;

    -- cargo: materializa perfis e enfileira os acessos com carência para a replicação AD → Entra
    IF v_cargo IS NOT NULL THEN
      -- cargo já gravado no INSERT: sem evento "mover", só materializa perfis + enfileira
      v_r := public.jml_alterar_cargo(v_id, v_cargo, v_op, 'manual', NULL, false);
      IF v_status = 'ativo' AND v_sam IS NOT NULL THEN
        UPDATE public.iam_queue SET next_retry_at = now() + interval '45 minutes', max_retries = GREATEST(COALESCE(max_retries, 10), 10)
         WHERE colaborador_id = v_id AND status = 'pending' AND action_type LIKE 'assign\_%' AND created_at >= v_start;
      END IF;
      v_res := v_res || jsonb_build_object('acessos_cargo', COALESCE((v_r->>'queued_assign')::int, 0));
    END IF;

    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('criar_colaborador', 'colaboradores', v_id::text, v_op, 'Criado: ' || v_nome,
            jsonb_build_object('email', v_email, 'sam', v_sam, 'cargo_id', v_cargo, 'status', v_status) || v_res);
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'criado', true) || v_res;
  END IF;

  -- ── edição ──
  SELECT * INTO v_old FROM public.colaboradores WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(email) = v_email AND id <> p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe outro colaborador com este e-mail');
  END IF;

  UPDATE public.colaboradores
     SET nome = v_nome, email = v_email, cpf = NULLIF(trim(p_dados->>'cpf'),''), matricula = NULLIF(trim(p_dados->>'matricula'),''),
         sam_account_name = COALESCE(v_sam, sam_account_name), empresa_id = v_emp, area_id = v_area, localidade_id = v_loc,
         gestor_id = v_gestor, data_admissao = v_adm
   WHERE id = p_id;
  v_ident := public.iam_identity(p_id, NULL);

  -- mudança de cargo (mover) — provisiona/remove via delta
  IF v_old.cargo_id IS DISTINCT FROM v_cargo THEN
    IF v_cargo IS NULL THEN
      UPDATE public.colaboradores SET cargo_id = NULL WHERE id = p_id;
      UPDATE public.perfil_atribuicoes SET ativo = false, data_revogacao = now() WHERE colaborador_id = p_id AND origem = 'cargo' AND ativo;
    ELSE
      v_r := public.jml_alterar_cargo(p_id, v_cargo, v_op, 'manual', v_old.cargo_id, true);
      v_res := v_res || jsonb_build_object('mover', v_r);
    END IF;
    v_changed := array_append(v_changed, 'title');
    v_newvals := v_newvals || jsonb_build_object('title', (SELECT nome FROM public.cargos WHERE id = v_cargo));
  END IF;
  IF v_old.area_id IS DISTINCT FROM v_area THEN
    v_changed := array_append(v_changed, 'department');
    v_newvals := v_newvals || jsonb_build_object('department', (SELECT nome FROM public.areas WHERE id = v_area));
    IF v_old.cargo_id IS NOT DISTINCT FROM v_cargo THEN
      INSERT INTO public.eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
      VALUES ('mover', 'executado', p_id, v_nome, 'manual',
              jsonb_build_object('area_id', v_old.area_id, 'area', (SELECT nome FROM public.areas WHERE id = v_old.area_id)),
              jsonb_build_object('area_id', v_area, 'area', (SELECT nome FROM public.areas WHERE id = v_area), 'operador', v_op));
    END IF;
  END IF;
  IF v_old.empresa_id IS DISTINCT FROM v_emp THEN
    v_changed := array_append(v_changed, 'company');
    v_newvals := v_newvals || jsonb_build_object('company', (SELECT nome FROM public.empresas WHERE id = v_emp));
  END IF;
  IF v_old.nome IS DISTINCT FROM v_nome THEN
    v_changed := array_append(v_changed, 'displayName');
    v_newvals := v_newvals || jsonb_build_object('displayName', v_nome);
  END IF;

  -- atributos no diretório (só quando a conta continua/fica ativa)
  IF array_length(v_changed, 1) > 0 AND v_status NOT IN ('desligado', 'inativo') AND (v_ident->>'sam' IS NOT NULL OR v_ident->>'email' IS NOT NULL) THEN
    IF v_ident->>'sam' IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_ident, 'update',
        jsonb_build_object('status', 'enabled', 'changed_fields', to_jsonb(v_changed), 'new_values', v_newvals, 'reason', 'atualizacao_cadastral'),
        'ad_attrs:' || (v_ident->>'sam') || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
    END IF;
    PERFORM public.iam_queue_insert(v_ident, 'update_entra',
      jsonb_build_object('department', v_newvals->>'department', 'jobTitle', v_newvals->>'title', 'companyName', v_newvals->>'company',
                         'displayName', v_newvals->>'displayName', 'reason', 'atualizacao_cadastral'),
      'entra_attrs:' || (v_ident->>'target_identity') || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
    v_res := v_res || jsonb_build_object('atributos_enfileirados', true, 'campos', to_jsonb(v_changed));
  END IF;

  -- mudança de status (leaver / soft / reativação) — RPC transacional
  IF v_old.status::text IS DISTINCT FROM v_status THEN
    v_r := public.jml_alterar_status(p_id, v_status, v_op, 'manual', NULLIF(p_dados->>'motivo',''), false);
    IF COALESCE((v_r->>'ok')::boolean, false) = false THEN
      RAISE EXCEPTION '%', COALESCE(v_r->>'error', 'Falha ao alterar status');
    END IF;
    v_res := v_res || jsonb_build_object('status', v_r);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('editar_colaborador', 'colaboradores', p_id::text, v_op, 'Editado: ' || v_nome,
          jsonb_build_object('campos_diretorio', to_jsonb(v_changed), 'status_anterior', v_old.status, 'status_novo', v_status,
                             'cargo_anterior', v_old.cargo_id, 'cargo_novo', v_cargo));
  RETURN jsonb_build_object('ok', true, 'id', p_id, 'criado', false) || v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.colaborador_salvar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colaborador_salvar(uuid, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Cadastro de terceiro — criação/edição; ativo/inativo via terceiro_alterar_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terceiro_salvar(p_id uuid, p_dados jsonb, p_operador text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_op    text;
  v_old   terceiros%ROWTYPE;
  v_id    uuid := p_id;
  v_nome  text := NULLIF(trim(p_dados->>'nome'), '');
  v_email text := NULLIF(lower(trim(p_dados->>'email')), '');
  v_sam   text := NULLIF(trim(p_dados->>'sam_account_name'), '');
  v_emp   text := NULLIF(trim(p_dados->>'empresa_terceira'), '');
  v_ativo boolean := COALESCE((p_dados->>'ativo')::boolean, true);
  v_upn_dom text := COALESCE(public.iam_param('ad_upn_dominio', 'ebessolar.local'), 'ebessolar.local');
  v_ident jsonb;
  v_parts text[];
  v_r     jsonb;
  v_res   jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = v_uid;
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nome é obrigatório'); END IF;
  IF v_emp IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Empresa é obrigatória'); END IF;

  IF p_id IS NULL THEN
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.terceiros WHERE lower(email) = v_email) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um terceiro com este e-mail');
    END IF;
    INSERT INTO public.terceiros (nome, email, empresa_terceira, contrato_inicio, contrato_fim, criticidade, responsavel, responsavel_colaborador_id, ativo, sam_account_name)
    VALUES (v_nome, v_email, v_emp, NULLIF(p_dados->>'contrato_inicio','')::date, NULLIF(p_dados->>'contrato_fim','')::date,
            COALESCE(NULLIF(p_dados->>'criticidade',''), 'media')::criticidade, NULLIF(trim(p_dados->>'responsavel'),''),
            NULLIF(p_dados->>'responsavel_colaborador_id','')::uuid, v_ativo, v_sam)
    RETURNING id INTO v_id;
    v_ident := public.iam_identity(NULL, v_id);
    INSERT INTO public.eventos_jml (tipo, status, terceiro_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('joiner', 'executado', v_id, v_nome, 'manual', jsonb_build_object('terceiro_id', v_id),
            jsonb_build_object('empresa', v_emp, 'contrato_fim', p_dados->>'contrato_fim', 'ativo', v_ativo, 'operador', v_op));
    IF v_ativo AND v_sam IS NOT NULL THEN
      v_parts := regexp_split_to_array(v_nome, '\s+');
      PERFORM public.iam_queue_insert(v_ident, 'create',
        jsonb_build_object('givenName', v_parts[1], 'surname', COALESCE(NULLIF(array_to_string(v_parts[2:], ' '), ''), v_parts[1]),
                           'userPrincipalName', v_sam || '@' || v_upn_dom, 'title', 'Terceiro', 'company', v_emp,
                           'changePasswordAtLogon', true, 'reason', 'joiner_terceiro',
                           'accountExpires', p_dados->>'contrato_fim'),
        'ad_account:' || v_sam, v_op, 'pending');
      v_res := v_res || jsonb_build_object('conta_enfileirada', true);
    END IF;
    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('criar_terceiro', 'terceiros', v_id::text, v_op, 'Criado: ' || v_nome, jsonb_build_object('empresa', v_emp, 'sam', v_sam) || v_res);
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'criado', true) || v_res;
  END IF;

  SELECT * INTO v_old FROM public.terceiros WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Terceiro não encontrado'); END IF;
  UPDATE public.terceiros
     SET nome = v_nome, email = v_email, empresa_terceira = v_emp,
         contrato_inicio = NULLIF(p_dados->>'contrato_inicio','')::date, contrato_fim = NULLIF(p_dados->>'contrato_fim','')::date,
         criticidade = COALESCE(NULLIF(p_dados->>'criticidade',''), criticidade::text)::criticidade,
         responsavel = NULLIF(trim(p_dados->>'responsavel'),''), responsavel_colaborador_id = NULLIF(p_dados->>'responsavel_colaborador_id','')::uuid,
         sam_account_name = COALESCE(v_sam, sam_account_name)
   WHERE id = p_id;

  -- prorrogação/antecipação de contrato reflete no AD (accountExpires)
  IF v_old.contrato_fim IS DISTINCT FROM NULLIF(p_dados->>'contrato_fim','')::date AND COALESCE(v_sam, v_old.sam_account_name) IS NOT NULL AND v_ativo THEN
    v_ident := public.iam_identity(NULL, p_id);
    PERFORM public.iam_queue_insert(v_ident, 'update',
      jsonb_build_object('status', 'enabled', 'changed_fields', jsonb_build_array('accountExpires'),
                         'new_values', jsonb_build_object('accountExpires', p_dados->>'contrato_fim'), 'reason', 'contrato_alterado'),
      'ad_attrs:' || COALESCE(v_sam, v_old.sam_account_name) || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
  END IF;

  IF v_old.ativo IS DISTINCT FROM v_ativo THEN
    v_r := public.terceiro_alterar_status(p_id, v_ativo, v_op, 'manual', NULLIF(p_dados->>'motivo',''));
    IF COALESCE((v_r->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', COALESCE(v_r->>'error', 'Falha ao alterar status'); END IF;
    v_res := v_res || jsonb_build_object('status', v_r);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('editar_terceiro', 'terceiros', p_id::text, v_op, 'Editado: ' || v_nome);
  RETURN jsonb_build_object('ok', true, 'id', p_id, 'criado', false) || v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.terceiro_salvar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terceiro_salvar(uuid, jsonb, text) TO authenticated, service_role;

-- terceiros nunca são apagados: "excluir" = desligar (mesma política dos colaboradores)
CREATE OR REPLACE FUNCTION public.terceiros_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('origo.allow_hard_delete', true), '') = 'on' THEN RETURN OLD; END IF;
  IF OLD.ativo THEN
    PERFORM public.terceiro_alterar_status(OLD.id, false, COALESCE(auth.jwt() ->> 'email', current_user), 'manual', 'Exclusão solicitada na ferramenta');
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('delete_convertido_em_desligamento', 'terceiros', OLD.id::text, COALESCE(auth.jwt() ->> 'email', current_user),
          format('Tentativa de exclusão de %s convertida em desligamento (identidades são preservadas para auditoria).', OLD.nome));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_terceiros_soft_delete ON public.terceiros;
CREATE TRIGGER trg_terceiros_soft_delete BEFORE DELETE ON public.terceiros
  FOR EACH ROW EXECUTE FUNCTION public.terceiros_soft_delete();

-- ---------------------------------------------------------------------------
-- 12. Fila: reprocessar todas as falhas; estatísticas sem limite de linhas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_reprocessar_falhas(p_action_types text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_n int; v_email text;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  UPDATE public.iam_queue
     SET status = 'pending', error_code = NULL, result_message = NULL, next_retry_at = NULL, retry_count = 0
   WHERE status = 'failed' AND (p_action_types IS NULL OR action_type = ANY (p_action_types));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    INSERT INTO public.auditoria (acao, entidade, operador, resumo)
    VALUES ('reprocessar_falhas', 'iam_queue', COALESCE(v_email, v_uid::text), format('%s item(ns) com falha devolvidos à fila', v_n));
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.iam_queue_reprocessar_falhas(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_reprocessar_falhas(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iam_queue_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending',          count(*) FILTER (WHERE status = 'pending'),
    'waiting_approval', count(*) FILTER (WHERE status = 'waiting_approval'),
    'processing',       count(*) FILTER (WHERE status = 'processing'),
    'failed',           count(*) FILTER (WHERE status = 'failed'),
    'success_7d',       count(*) FILTER (WHERE status = 'success'   AND COALESCE(processed_at, created_at) >= now() - interval '7 days'),
    'cancelled_7d',     count(*) FILTER (WHERE status IN ('cancelled','rejected') AND COALESCE(processed_at, created_at) >= now() - interval '7 days'),
    'total',            count(*),
    'oldest_pending',   min(created_at) FILTER (WHERE status = 'pending'),
    'retry_scheduled',  count(*) FILTER (WHERE status = 'pending' AND next_retry_at > now()))
  FROM public.iam_queue;
$$;
REVOKE ALL ON FUNCTION public.iam_queue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_stats() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. Métricas do dashboard em uma única chamada (invalidada via realtime)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  v_sod int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege'; END IF;

  -- pessoas
  SELECT v || jsonb_build_object(
    'colab_ativos',     count(*) FILTER (WHERE status = 'ativo'),
    'colab_ferias',     count(*) FILTER (WHERE status = 'ferias'),
    'colab_afastados',  count(*) FILTER (WHERE status = 'afastado'),
    'colab_inativos',   count(*) FILTER (WHERE status = 'inativo'),
    'colab_desligados', count(*) FILTER (WHERE status = 'desligado'),
    'colab_total',      count(*),
    'colab_sem_entra',  count(*) FILTER (WHERE status = 'ativo' AND entra_id IS NULL),
    'colab_sem_cargo',  count(*) FILTER (WHERE status = 'ativo' AND cargo_id IS NULL),
    'colab_suspensos',  count(*) FILTER (WHERE suspenso_preventivo),
    'joiners_30d',      (SELECT count(*) FROM colaboradores c2 WHERE c2.created_at >= now() - interval '30 days'),
    'leavers_30d',      (SELECT count(*) FROM eventos_jml e WHERE e.tipo = 'leaver' AND e.created_at >= now() - interval '30 days'))
  INTO v FROM colaboradores;

  SELECT v || jsonb_build_object(
    'terc_ativos',      count(*) FILTER (WHERE ativo),
    'terc_inativos',    count(*) FILTER (WHERE NOT ativo),
    'terc_vencendo_30d', count(*) FILTER (WHERE ativo AND contrato_fim IS NOT NULL AND contrato_fim BETWEEN current_date AND current_date + 30),
    'terc_vencidos',    count(*) FILTER (WHERE ativo AND contrato_fim IS NOT NULL AND contrato_fim < current_date),
    'terc_revalidar',   count(*) FILTER (WHERE ativo AND COALESCE(ultima_revalidacao, contrato_inicio, created_at::date) < current_date - COALESCE(public.iam_param('terceiro_revalidacao_dias','45')::int, 45)))
  INTO v FROM terceiros;

  -- fila
  SELECT v || jsonb_build_object(
    'fila_pending',     count(*) FILTER (WHERE status = 'pending'),
    'fila_waiting',     count(*) FILTER (WHERE status = 'waiting_approval'),
    'fila_processing',  count(*) FILTER (WHERE status = 'processing'),
    'fila_failed',      count(*) FILTER (WHERE status = 'failed'),
    'fila_success_24h', count(*) FILTER (WHERE status = 'success' AND processed_at >= now() - interval '24 hours'),
    'fila_success_7d',  count(*) FILTER (WHERE status = 'success' AND processed_at >= now() - interval '7 days'),
    'fila_oldest_waiting', min(created_at) FILTER (WHERE status = 'waiting_approval'),
    'fila_oldest_pending', min(created_at) FILTER (WHERE status = 'pending'),
    'fila_tempo_medio_min', (SELECT round(avg(extract(epoch FROM (processed_at - COALESCE(approved_at, created_at))) / 60)::numeric, 1)
                               FROM iam_queue q2 WHERE q2.status = 'success' AND q2.processed_at >= now() - interval '7 days' AND q2.processed_at > COALESCE(q2.approved_at, q2.created_at)),
    'fila_orfaos',      count(*) FILTER (WHERE action_type = 'review_orphan_entra' AND status = 'waiting_approval'))
  INTO v FROM iam_queue;

  -- falhas por código (7d)
  SELECT v || jsonb_build_object('fila_falhas_por_codigo', COALESCE(jsonb_agg(jsonb_build_object('codigo', codigo, 'total', total) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT COALESCE(error_code, 'sem_codigo') AS codigo, count(*) AS total FROM iam_queue
           WHERE status = 'failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 6) f;

  -- ações por tipo (7d)
  SELECT v || jsonb_build_object('fila_por_acao_7d', COALESCE(jsonb_agg(jsonb_build_object('acao', action_type, 'total', total, 'sucesso', ok, 'falha', ko) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT action_type, count(*) AS total, count(*) FILTER (WHERE status = 'success') AS ok, count(*) FILTER (WHERE status = 'failed') AS ko
            FROM iam_queue WHERE created_at >= now() - interval '7 days' AND status <> 'cancelled' GROUP BY 1 ORDER BY 2 DESC LIMIT 10) a;

  -- governança
  SELECT v || jsonb_build_object(
    'solic_pendentes',   (SELECT count(*) FROM solicitacoes_acesso WHERE status IN ('pendente','em_aprovacao')),
    'excecoes_pendentes',(SELECT count(*) FROM excecoes WHERE status = 'pendente'),
    'excecoes_vencendo', (SELECT count(*) FROM excecoes WHERE status = 'aprovada' AND validade IS NOT NULL AND validade BETWEEN current_date AND current_date + 15),
    'excecoes_ativas',   (SELECT count(*) FROM excecoes WHERE status = 'aprovada' AND (validade IS NULL OR validade >= current_date)),
    'revisoes_abertas',  (SELECT count(*) FROM revisoes WHERE status = 'em_andamento'),
    'revisoes_itens_pendentes', (SELECT count(*) FROM revisao_itens ri JOIN revisoes r ON r.id = ri.revisao_id WHERE r.status = 'em_andamento' AND ri.decisao IS NULL),
    'revisoes_atrasadas',(SELECT count(*) FROM revisoes WHERE status = 'em_andamento' AND data_fim IS NOT NULL AND data_fim < current_date),
    'alertas_nao_lidos', (SELECT count(*) FROM alertas WHERE NOT lido),
    'alertas_criticos',  (SELECT count(*) FROM alertas WHERE NOT lido AND severidade::text = 'critico'),
    'perfis_ativos',     (SELECT count(*) FROM perfis_acesso WHERE ativo),
    'apps_total',        (SELECT count(*) FROM aplicacoes),
    'apps_sem_owner',    (SELECT count(*) FROM aplicacoes WHERE owner IS NULL OR owner = ''),
    'quarentena',        (SELECT count(*) FROM colab_quarentena WHERE status = 'pendente'),
    'priv_membros',      (SELECT count(DISTINCT user_entra_id) FROM entra_role_members),
    'priv_roles',        (SELECT count(*) FROM entra_roles WHERE is_privileged))
  INTO v;

  -- conflitos SoD ativos (pessoas com os dois perfis de um conflito ativo)
  SELECT count(*) INTO v_sod
    FROM sod_conflitos s
    JOIN perfil_atribuicoes a ON a.perfil_id = s.perfil_a_id AND a.ativo
    JOIN perfil_atribuicoes b ON b.perfil_id = s.perfil_b_id AND b.ativo
     AND ((a.colaborador_id IS NOT NULL AND a.colaborador_id = b.colaborador_id) OR (a.terceiro_id IS NOT NULL AND a.terceiro_id = b.terceiro_id))
   WHERE s.ativo;
  v := v || jsonb_build_object('sod_violacoes', v_sod);

  -- licenças críticas
  SELECT v || jsonb_build_object(
    'licencas_criticas', count(*) FILTER (WHERE total > 0 AND NOT COALESCE(is_trial,false) AND em_uso::numeric / total * 100 >= COALESCE(public.iam_param('licenca_critico_pct','90')::numeric, 90)),
    'licencas_total_seats', COALESCE(sum(total) FILTER (WHERE NOT COALESCE(is_trial,false)), 0),
    'licencas_em_uso',   COALESCE(sum(em_uso) FILTER (WHERE NOT COALESCE(is_trial,false)), 0))
  INTO v FROM entra_licencas;

  -- agente / ciclo diário
  SELECT v || jsonb_build_object('agente', COALESCE((SELECT jsonb_agg(jsonb_build_object('owner', owner, 'last_seen_at', last_seen_at, 'last_claim_at', last_claim_at,
                                                          'last_result_at', last_result_at, 'last_result', last_result, 'version', version, 'host', host, 'execute_mode', execute_mode) ORDER BY last_seen_at DESC)
                                             FROM iam_agent_status), '[]'::jsonb),
                                 'ultimo_ciclo', (SELECT jsonb_build_object('status', status, 'phase', phase, 'message', message, 'updated_at', updated_at, 'created_at', created_at)
                                                    FROM sync_jobs WHERE tipo = 'daily_cycle' ORDER BY created_at DESC LIMIT 1),
                                 'ultimo_csv',   (SELECT jsonb_build_object('status', status, 'message', message, 'updated_at', updated_at, 'created_at', created_at, 'filename', filename,
                                                                            'colab_created', colab_created, 'colab_updated', colab_updated, 'colab_inativos', colab_inativos)
                                                    FROM sync_jobs WHERE tipo = 'csv_colab' ORDER BY created_at DESC LIMIT 1),
                                 'ultima_reconciliacao', (SELECT jsonb_build_object('status', status, 'message', message, 'updated_at', updated_at, 'created_at', created_at)
                                                    FROM sync_jobs WHERE tipo = 'reconcile_identities' ORDER BY created_at DESC LIMIT 1),
                                 'gerado_em', now())
  INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics() TO authenticated;

-- séries temporais do dashboard (JML e fila por dia) em uma chamada
CREATE OR REPLACE FUNCTION public.dashboard_series(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dias AS (
    SELECT (current_date - (n || ' days')::interval)::date AS dia FROM generate_series(GREATEST(COALESCE(p_days, 30), 1) - 1, 0, -1) n
  ), fila AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*) FILTER (WHERE action_type LIKE 'assign\_%' OR action_type IN ('create','create_if_not_exists','enable_entra','create_user_app')) AS concessoes,
           count(*) FILTER (WHERE action_type LIKE 'remove\_%' OR action_type IN ('disable','disable_entra','delete','disable_user_app','delete_user_app')) AS revogacoes,
           count(*) FILTER (WHERE NOT (action_type LIKE 'assign\_%' OR action_type LIKE 'remove\_%' OR action_type IN ('create','create_if_not_exists','enable_entra','create_user_app','disable','disable_entra','delete','disable_user_app','delete_user_app'))) AS outros,
           count(*) FILTER (WHERE status = 'failed') AS falhas
      FROM iam_queue
     WHERE created_at >= current_date - GREATEST(COALESCE(p_days, 30), 1) AND status <> 'cancelled'
     GROUP BY 1
  ), jml AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'joiner') AS joiners,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'mover') AS movers,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'leaver') AS leavers,
           count(*) FILTER (WHERE tipo IN ('pre_leaver')) AS pre_leavers
      FROM eventos_jml
     WHERE created_at >= current_date - GREATEST(COALESCE(p_days, 30), 1)
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'dia', d.dia, 'concessoes', COALESCE(f.concessoes, 0), 'revogacoes', COALESCE(f.revogacoes, 0), 'outros', COALESCE(f.outros, 0), 'falhas', COALESCE(f.falhas, 0),
           'joiners', COALESCE(j.joiners, 0), 'movers', COALESCE(j.movers, 0), 'leavers', COALESCE(j.leavers, 0), 'pre_leavers', COALESCE(j.pre_leavers, 0)) ORDER BY d.dia)
    FROM dias d LEFT JOIN fila f ON f.dia = d.dia LEFT JOIN jml j ON j.dia = d.dia;
$$;
REVOKE ALL ON FUNCTION public.dashboard_series(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_series(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Eventos JML são um LOG: status legado só informativo — normaliza o que sobrou
-- ---------------------------------------------------------------------------
UPDATE public.eventos_jml SET status = 'executado' WHERE status IN ('executando', 'quarentena');
