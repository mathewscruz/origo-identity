-- =============================================================================
-- IGA hardening (3/7): ciclo de vida JML como RPCs transacionais
--
-- Antes: colaboradorLifecycle.ts / preLeaver.ts / terceiroLifecycle.ts /
-- provisionCargoAcessos.ts rodavam ~15 escritas sequenciais no NAVEGADOR (sem
-- transação) e o CSV tinha uma segunda implementação divergente no servidor.
--
-- Agora: uma implementação, atômica, usada pela UI, pelo CSV, pela expiração
-- automática e pelo MCP/agente.
-- =============================================================================

ALTER TABLE public.terceiros ADD COLUMN IF NOT EXISTS sam_account_name text;

-- Parâmetros novos (não sobrescreve valores existentes)
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('iam_enable_requires_approval', 'true',
   'Reabilitar conta (enable_entra / AD enabled) sempre entra em waiting_approval, independente do gate global'),
  ('mover_remocao_modo', 'aprovacao',
   'Ao mudar de cargo: aprovacao = remoções do cargo anterior entram em waiting_approval; imediato = pending; nenhum = não remove (legado)'),
  ('csv_leaver_limite_pct', '5',
   'Limite (%) de colaboradores ausentes no CSV acima do qual a importação NÃO aplica desligamentos e gera alerta crítico'),
  ('csv_leaver_limite_abs', '50',
   'Limite absoluto de ausentes no CSV acima do qual a importação NÃO aplica desligamentos'),
  ('modo_operacao', 'producao', 'producao | simulacao — em simulação nenhum executor age na fila'),
  ('iam_execution_mode', 'agent_orchestrated',
   'lovable_cloud = process-iam-queue executa Graph/apps; agent_orchestrated = Órigo/Hermes agent executa via iam-agent-api')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.iam_param(p_chave text, p_default text DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT valor FROM parametros WHERE chave = p_chave), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Provisiona os perfis de um cargo (materializa perfil_atribuicoes + enfileira)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_provisionar_cargo(
  p_colaborador_id uuid, p_cargo_id uuid, p_requested_by text, p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfis   uuid[];
  v_novos    uuid[];
  v_queued   int := 0;
  v_mat      int := 0;
BEGIN
  IF p_cargo_id IS NULL THEN RETURN jsonb_build_object('materializados', 0, 'enfileirados', 0); END IF;
  SELECT COALESCE(array_agg(cp.perfil_id), '{}') INTO v_perfis
    FROM cargo_perfis cp JOIN perfis_acesso p ON p.id = cp.perfil_id AND p.ativo
   WHERE cp.cargo_id = p_cargo_id;
  IF COALESCE(array_length(v_perfis, 1), 0) = 0 THEN RETURN jsonb_build_object('materializados', 0, 'enfileirados', 0); END IF;

  -- só perfis que ainda não estão ativos para a pessoa
  SELECT COALESCE(array_agg(p), '{}') INTO v_novos
    FROM unnest(v_perfis) p
   WHERE NOT EXISTS (SELECT 1 FROM perfil_atribuicoes pa WHERE pa.colaborador_id = p_colaborador_id AND pa.perfil_id = p AND pa.ativo);

  INSERT INTO perfil_atribuicoes (perfil_id, colaborador_id, origem, ativo)
  SELECT p, p_colaborador_id, 'cargo', true FROM unnest(v_novos) p;
  GET DIAGNOSTICS v_mat = ROW_COUNT;

  IF v_mat > 0 THEN
    v_queued := public.iam_enqueue_profile_actions(p_colaborador_id, NULL, v_novos, 'assign', p_requested_by, p_status, 'cargo');
  END IF;
  RETURN jsonb_build_object('materializados', v_mat, 'enfileirados', v_queued, 'perfis', to_jsonb(v_novos));
END;
$$;

-- ---------------------------------------------------------------------------
-- MOVER: mudança de cargo com delta (adiciona o novo, remove o exclusivo do antigo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_alterar_cargo(
  p_colaborador_id uuid, p_novo_cargo_id uuid, p_operador text,
  p_origem text DEFAULT 'manual', p_cargo_anterior_id uuid DEFAULT NULL, p_atualizar_colaborador boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c          colaboradores%ROWTYPE;
  v_old        uuid;
  v_old_perfis uuid[];
  v_new_perfis uuid[];
  v_add        uuid[];
  v_rem        uuid[];
  v_modo       text := COALESCE(public.iam_param('mover_remocao_modo', 'aprovacao'), 'aprovacao');
  v_req        text := COALESCE(p_operador, 'sistema');
  v_revoked    int := 0;
  v_prov       jsonb;
  v_q_rem      int := 0;
  v_identity   jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_old := COALESCE(p_cargo_anterior_id, v_c.cargo_id);

  IF p_atualizar_colaborador AND v_c.cargo_id IS DISTINCT FROM p_novo_cargo_id THEN
    UPDATE colaboradores SET cargo_id = p_novo_cargo_id WHERE id = p_colaborador_id;
  END IF;

  SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_old_perfis FROM cargo_perfis WHERE cargo_id = v_old;
  SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_new_perfis FROM cargo_perfis WHERE cargo_id = p_novo_cargo_id;
  SELECT COALESCE(array_agg(p), '{}') INTO v_add FROM unnest(v_new_perfis) p WHERE NOT (p = ANY (v_old_perfis));
  SELECT COALESCE(array_agg(p), '{}') INTO v_rem FROM unnest(v_old_perfis) p WHERE NOT (p = ANY (v_new_perfis));

  -- 1. revoga atribuições de origem cargo que não pertencem ao novo cargo
  UPDATE perfil_atribuicoes
     SET ativo = false, data_revogacao = now()
   WHERE colaborador_id = p_colaborador_id AND origem = 'cargo' AND ativo
     AND NOT (perfil_id = ANY (v_new_perfis));
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  -- 2. materializa e enfileira o novo cargo
  v_prov := public.jml_provisionar_cargo(p_colaborador_id, p_novo_cargo_id, v_req, 'pending');

  -- 3. remove recursos exclusivos do cargo antigo (acesso efetivo já considera o novo cargo)
  IF v_modo <> 'nenhum' AND COALESCE(array_length(v_rem, 1), 0) > 0 THEN
    v_q_rem := public.iam_enqueue_profile_actions(
      p_colaborador_id, NULL, v_rem, 'remove', v_req,
      CASE WHEN v_modo = 'imediato' THEN 'pending' ELSE 'waiting_approval' END, 'mover');
  END IF;

  v_identity := public.iam_identity(p_colaborador_id, NULL);

  IF v_old IS DISTINCT FROM p_novo_cargo_id THEN
    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('mover', 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('cargo_id', v_old, 'cargo', (SELECT nome FROM cargos WHERE id = v_old)),
            jsonb_build_object('cargo_id', p_novo_cargo_id, 'cargo', (SELECT nome FROM cargos WHERE id = p_novo_cargo_id),
                               'perfis_adicionados', to_jsonb(v_add), 'perfis_removidos', to_jsonb(v_rem),
                               'remocoes_enfileiradas', v_q_rem, 'modo_remocao', v_modo, 'operador', v_req));
    INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('jml_mover', 'colaboradores', p_colaborador_id::text, v_req,
            format('Mover: %s — cargo alterado (%s perfis adicionados, %s removidos, %s remoções enfileiradas [%s])',
                   v_c.nome, COALESCE(array_length(v_add,1),0), COALESCE(array_length(v_rem,1),0), v_q_rem, v_modo),
            jsonb_build_object('cargo_anterior', v_old, 'cargo_novo', p_novo_cargo_id, 'origem', p_origem));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'provisioned', COALESCE((v_prov->>'materializados')::int, 0),
    'queued_assign', COALESCE((v_prov->>'enfileirados')::int, 0),
    'revoked', v_revoked,
    'queued_remove', v_q_rem,
    'modo_remocao', v_modo,
    'skippedDirectory', (COALESCE(v_identity->>'email','') = '' AND COALESCE(v_identity->>'sam','') = ''));
END;
$$;

-- ---------------------------------------------------------------------------
-- LEAVER / SOFT DISABLE / REATIVAÇÃO (status do colaborador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_alterar_status(
  p_colaborador_id uuid, p_novo_status text, p_operador text,
  p_origem text DEFAULT 'manual', p_motivo text DEFAULT NULL, p_skip_status_update boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c            colaboradores%ROWTYPE;
  v_old          text;
  v_new          text := p_novo_status;
  v_req          text := COALESCE(p_operador, 'sistema');
  v_id           jsonb;
  v_sam          text;
  v_target       text;
  v_hard         boolean;
  v_soft         boolean;
  v_react        boolean;
  v_was_pre      boolean := false;
  v_gap          int;
  v_exc          record;
  v_perfis       uuid[] := '{}';
  v_rem_perfis   int := 0;
  v_indiv        jsonb := '{}'::jsonb;
  v_gestor_email text;
  v_gestor_nome  text;
  v_enable_st    text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
  v_last         jsonb;
  v_restored     int := 0;
  v_item         jsonb;
  v_prov         jsonb := '{}'::jsonb;
  v_evento_tipo  text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF v_new NOT IN ('ativo','inativo','ferias','afastado','desligado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || COALESCE(v_new,'(nulo)'));
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_old := v_c.status::text;
  IF v_old = v_new THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;

  v_hard  := v_new IN ('inativo','desligado') AND v_old NOT IN ('inativo','desligado');
  v_soft  := v_old = 'ativo' AND v_new IN ('ferias','afastado');
  v_react := v_old <> 'ativo' AND v_new = 'ativo';

  -- Exceção "manter ativo" aprovada e vigente bloqueia desativação hard (qualquer origem)
  IF v_hard THEN
    SELECT id, validade, solicitante INTO v_exc
      FROM excecoes
     WHERE colaborador_id = p_colaborador_id AND tipo_excecao = 'manter_ativo' AND status = 'aprovada'
       AND validade >= current_date
     ORDER BY validade DESC LIMIT 1;
    IF v_exc.id IS NOT NULL THEN
      INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
      VALUES ('bloquear_desativacao_excecao', 'colaboradores', p_colaborador_id::text, v_req,
              format('Desativação de %s bloqueada por exceção "Manter Ativo" válida até %s (%s)', v_c.nome, v_exc.validade, p_origem));
      RETURN jsonb_build_object('ok', false, 'blocked', true,
        'error', format('Existe uma exceção "Manter Ativo" aprovada até %s (Solicitante: %s). Remova ou aguarde a expiração para desativar.',
                        to_char(v_exc.validade, 'DD/MM/YYYY'), v_exc.solicitante));
    END IF;
  END IF;

  IF NOT p_skip_status_update THEN
    UPDATE colaboradores SET status = v_new::status_colaborador WHERE id = p_colaborador_id;
  END IF;

  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('alterar_status_colaborador', 'colaboradores', p_colaborador_id::text, v_req,
          format('Status: %s → %s — %s', v_old, v_new, v_c.nome),
          jsonb_build_object('origem', p_origem, 'motivo', p_motivo));

  v_id     := public.iam_identity(p_colaborador_id, NULL);
  v_sam    := NULLIF(v_id->>'sam', '');
  v_target := NULLIF(v_id->>'target_identity', '');

  -- ═══════════ DESATIVAÇÃO ═══════════
  IF v_hard OR v_soft THEN
    v_was_pre := COALESCE(v_c.suspenso_preventivo, false);
    v_gap := CASE WHEN v_was_pre AND v_c.suspenso_em IS NOT NULL
                  THEN GREATEST(0, floor(extract(epoch FROM (now() - v_c.suspenso_em)) / 86400))::int END;

    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Colaborador desabilitado',
            CASE WHEN v_was_pre
                 THEN format('%s foi formalmente desligado. Suspensão preventiva já estava ativa há %s dia(s) — reconciliado.', v_c.nome, v_gap)
                 ELSE format('%s teve o status alterado para %s (%s)', v_c.nome, v_new, p_origem) END,
            (CASE WHEN v_was_pre THEN 'info' ELSE 'aviso' END)::severidade_alerta, 'colaborador_desabilitado',
            'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);

    IF NOT v_was_pre THEN
      IF v_sam IS NOT NULL THEN
        PERFORM public.iam_queue_insert(v_id, 'disable',
          jsonb_build_object('status', 'disabled', 'status_anterior', v_old, 'status_novo', v_new,
                             'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','disabled'),
                             'motivo', p_motivo),
          'ad_account:' || v_sam, v_req, 'pending');
      END IF;
      IF v_target IS NOT NULL THEN
        PERFORM public.iam_queue_insert(v_id, 'disable_entra',
          jsonb_build_object('revokeSignInSessions', v_hard, 'motivo', p_motivo, 'status_novo', v_new),
          'entra_account:' || v_target, v_req, 'pending');
      END IF;
      IF v_sam IS NULL AND v_target IS NULL THEN
        INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
        VALUES ('Desativação sem identidade', format('%s foi desativado no IAM, mas não tem e-mail/SAM — nenhuma conta foi desabilitada.', v_c.nome),
                'critico', 'identidade_incompleta', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
      END IF;
    ELSE
      UPDATE colaboradores
         SET suspenso_preventivo = false, suspenso_em = NULL, suspenso_por = NULL, suspenso_motivo = NULL
       WHERE id = p_colaborador_id;
    END IF;

    IF v_hard AND p_origem = 'manual' THEN
      UPDATE colaboradores
         SET desligado_manual = true, desligado_manual_em = now(), desligado_manual_por = v_req
       WHERE id = p_colaborador_id;
    END IF;

    IF v_hard THEN
      v_perfis := public.iam_active_perfil_ids(p_colaborador_id, NULL);
      UPDATE perfil_atribuicoes SET ativo = false, data_revogacao = now()
       WHERE colaborador_id = p_colaborador_id AND ativo;
      IF COALESCE(array_length(v_perfis, 1), 0) > 0 THEN
        v_rem_perfis := public.iam_enqueue_profile_actions(p_colaborador_id, NULL, v_perfis, 'remove', v_req, 'pending', 'leaver');
      END IF;
      v_indiv := public.iam_enqueue_individual_removals(p_colaborador_id, NULL, v_req, 'pending');
    END IF;

    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('leaver', 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('status', v_old, 'tipo_desativacao', CASE WHEN v_hard THEN 'hard' ELSE 'soft' END,
                               'perfis', to_jsonb(v_perfis), 'recursos_individuais', COALESCE(v_indiv->'snapshot', '[]'::jsonb),
                               'pre_suspensao_aplicada', v_was_pre, 'gap_dias', v_gap),
            jsonb_build_object('status', v_new, 'motivo', p_motivo, 'operador', v_req,
                               'remocoes_perfil', v_rem_perfis, 'remocoes_individuais', COALESCE((v_indiv->>'enfileirados')::int, 0)));
  END IF;

  -- ═══════════ REATIVAÇÃO ═══════════
  IF v_react THEN
    UPDATE colaboradores
       SET desligado_manual = false, desligado_manual_em = NULL, desligado_manual_por = NULL
     WHERE id = p_colaborador_id;

    IF v_sam IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'update',
        jsonb_build_object('status', 'enabled', 'status_anterior', v_old, 'status_novo', 'ativo',
                           'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','enabled'),
                           'motivo', p_motivo),
        'ad_account:' || v_sam, v_req, v_enable_st);
    END IF;
    IF v_target IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'enable_entra',
        jsonb_build_object('motivo', p_motivo, 'status_anterior', v_old),
        'entra_account:' || v_target, v_req, v_enable_st);
    END IF;

    -- desligamento hard revogou os perfis: reprovisiona o cargo
    IF NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE colaborador_id = p_colaborador_id AND ativo) AND v_c.cargo_id IS NOT NULL THEN
      v_prov := public.jml_provisionar_cargo(p_colaborador_id, v_c.cargo_id, v_req, 'pending');
    END IF;

    -- recursos individuais do último leaver hard: voltam SÓ com aprovação
    SELECT dados_antes INTO v_last FROM eventos_jml
     WHERE colaborador_id = p_colaborador_id AND tipo = 'leaver' ORDER BY created_at DESC LIMIT 1;
    IF v_last->>'tipo_desativacao' = 'hard' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_last->'recursos_individuais', '[]'::jsonb)) LOOP
        IF public.iam_queue_insert(v_id, v_item->>'action_type', COALESCE(v_item->'payload_json', '{}'::jsonb),
             COALESCE(v_item->>'resource_key', public.iam_queue_resource_key(v_item->>'action_type', v_item->'payload_json', NULL)),
             COALESCE(v_item->>'requested_by', 'manual_individual'), 'waiting_approval',
             jsonb_build_object('reason', 'restauracao_reativacao'))
        THEN v_restored := v_restored + 1; END IF;
      END LOOP;
    END IF;

    v_evento_tipo := CASE WHEN v_old IN ('inativo','desligado') THEN 'joiner' ELSE 'mover' END;
    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES (v_evento_tipo::tipo_evento_jml, 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('status', v_old),
            jsonb_build_object('status', v_new, 'motivo', p_motivo, 'operador', v_req, 'retorno', v_old IN ('ferias','afastado'),
                               'recursos_individuais_restaurados', v_restored, 'cargo_reprovisionado', v_prov));
    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Colaborador reativado', format('%s foi reativado (%s). Reabilitação de conta aguarda %s.', v_c.nome, p_origem,
            CASE WHEN v_enable_st = 'waiting_approval' THEN 'aprovação' ELSE 'execução' END),
            'info', 'colaborador_reativado', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
  END IF;

  IF v_c.gestor_id IS NOT NULL THEN
    SELECT nome, email INTO v_gestor_nome, v_gestor_email FROM colaboradores WHERE id = v_c.gestor_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status_anterior', v_old, 'status_novo', v_new,
    'tipo_desativacao', CASE WHEN v_hard THEN 'hard' WHEN v_soft THEN 'soft' ELSE NULL END,
    'reativacao', v_react,
    'perfis_revogados', COALESCE(array_length(v_perfis, 1), 0),
    'remocoes_enfileiradas', v_rem_perfis + COALESCE((v_indiv->>'enfileirados')::int, 0),
    'restaurados', v_restored,
    'gestor_email', v_gestor_email, 'gestor_nome', v_gestor_nome);
END;
$$;

-- ---------------------------------------------------------------------------
-- PRÉ-LEAVER (suspensão preventiva) e reversão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_pre_leaver(p_colaborador_id uuid, p_motivo text, p_operador text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c      colaboradores%ROWTYPE;
  v_id     jsonb;
  v_sam    text;
  v_target text;
  v_req    text := 'pre_leaver:' || COALESCE(p_operador, 'sistema');
  v_gestor_email text;
  v_gestor_nome  text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Justificativa obrigatória (mínimo 10 caracteres).');
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_id := public.iam_identity(p_colaborador_id, NULL);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Colaborador sem e-mail/samAccountName — não há identidade para suspender.');
  END IF;

  UPDATE colaboradores
     SET suspenso_preventivo = true, suspenso_em = now(), suspenso_por = COALESCE(p_operador,'sistema'), suspenso_motivo = trim(p_motivo)
   WHERE id = p_colaborador_id;

  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'disable',
      jsonb_build_object('status','disabled','motivo','pre_leaver','justificativa', trim(p_motivo),
                         'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','disabled')),
      'ad_account:' || v_sam, v_req, 'pending');
  END IF;
  PERFORM public.iam_queue_insert(v_id, 'disable_entra',
    jsonb_build_object('motivo','pre_leaver','justificativa', trim(p_motivo),'revokeSignInSessions', true),
    'entra_account:' || v_target, v_req, 'pending');

  INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('pre_leaver', 'executado', p_colaborador_id, v_c.nome, 'manual',
          jsonb_build_object('suspenso_preventivo', false),
          jsonb_build_object('suspenso_preventivo', true, 'motivo', trim(p_motivo), 'operador', p_operador, 'suspenso_em', now()));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('suspender_preventivo', 'colaboradores', p_colaborador_id::text, p_operador,
          'Suspensão preventiva: ' || v_c.nome, jsonb_build_object('motivo', trim(p_motivo), 'identity', v_target));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Suspensão preventiva ativada', format('%s teve os acessos suspensos preventivamente. Motivo: %s', v_c.nome, trim(p_motivo)),
          'critico', 'pre_leaver_ativado', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);

  IF v_c.gestor_id IS NOT NULL THEN SELECT nome, email INTO v_gestor_nome, v_gestor_email FROM colaboradores WHERE id = v_c.gestor_id; END IF;
  RETURN jsonb_build_object('ok', true, 'gestor_email', v_gestor_email, 'gestor_nome', v_gestor_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.jml_pre_leaver_reverter(p_colaborador_id uuid, p_motivo text, p_operador text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c      colaboradores%ROWTYPE;
  v_id     jsonb;
  v_sam    text;
  v_target text;
  v_req    text := 'pre_leaver_revert:' || COALESCE(p_operador, 'sistema');
  v_st     text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Justificativa obrigatória (mínimo 10 caracteres).');
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_id := public.iam_identity(p_colaborador_id, NULL);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador sem identidade.'); END IF;

  UPDATE colaboradores
     SET suspenso_preventivo = false, suspenso_em = NULL, suspenso_por = NULL, suspenso_motivo = NULL
   WHERE id = p_colaborador_id;

  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'update',
      jsonb_build_object('status','enabled','motivo','pre_leaver_revertido','justificativa', trim(p_motivo),
                         'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','enabled')),
      'ad_account:' || v_sam, v_req, v_st);
  END IF;
  PERFORM public.iam_queue_insert(v_id, 'enable_entra',
    jsonb_build_object('motivo','pre_leaver_revertido','justificativa', trim(p_motivo)),
    'entra_account:' || v_target, v_req, v_st);

  INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('pre_leaver_revertido', 'executado', p_colaborador_id, v_c.nome, 'manual',
          jsonb_build_object('suspenso_preventivo', true),
          jsonb_build_object('suspenso_preventivo', false, 'motivo', trim(p_motivo), 'operador', p_operador));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('reverter_suspensao_preventiva', 'colaboradores', p_colaborador_id::text, p_operador,
          'Suspensão preventiva revertida: ' || v_c.nome, jsonb_build_object('motivo', trim(p_motivo)));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Suspensão preventiva revertida', format('%s teve a suspensão preventiva revertida. Motivo: %s', v_c.nome, trim(p_motivo)),
          'aviso', 'pre_leaver_revertido', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
  RETURN jsonb_build_object('ok', true, 'reabilitacao', v_st);
END;
$$;

-- ---------------------------------------------------------------------------
-- TERCEIROS: desligar / reativar (usado pela UI e pela expiração automática)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terceiro_alterar_status(
  p_terceiro_id uuid, p_ativo boolean, p_operador text, p_origem text DEFAULT 'manual', p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t        terceiros%ROWTYPE;
  v_id       jsonb;
  v_sam      text;
  v_target   text;
  v_req      text := COALESCE(p_operador, 'sistema');
  v_perfis   uuid[] := '{}';
  v_rem      int := 0;
  v_indiv    jsonb := '{}'::jsonb;
  v_last     jsonb;
  v_restored int := 0;
  v_pf_rest  int := 0;
  v_item     jsonb;
  v_p        uuid;
  v_st       text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT * INTO v_t FROM terceiros WHERE id = p_terceiro_id;
  IF v_t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Terceiro não encontrado'); END IF;
  IF v_t.ativo = p_ativo THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;
  v_id := public.iam_identity(NULL, p_terceiro_id);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');

  IF NOT p_ativo THEN
    UPDATE terceiros SET ativo = false WHERE id = p_terceiro_id;
    v_perfis := public.iam_active_perfil_ids(NULL, p_terceiro_id);
    UPDATE perfil_atribuicoes SET ativo = false, data_revogacao = now() WHERE terceiro_id = p_terceiro_id AND ativo;
    IF COALESCE(array_length(v_perfis,1),0) > 0 THEN
      v_rem := public.iam_enqueue_profile_actions(NULL, p_terceiro_id, v_perfis, 'remove', v_req, 'pending', 'leaver_terceiro');
    END IF;
    v_indiv := public.iam_enqueue_individual_removals(NULL, p_terceiro_id, v_req, 'pending');
    IF v_sam IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'disable',
        jsonb_build_object('status','disabled','motivo', p_motivo,'changed_fields', jsonb_build_array('status'),'new_values', jsonb_build_object('status','disabled')),
        'ad_account:' || v_sam, v_req, 'pending');
    END IF;
    IF v_target IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'disable_entra',
        jsonb_build_object('revokeSignInSessions', true, 'motivo', p_motivo), 'entra_account:' || v_target, v_req, 'pending');
    ELSE
      INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
      VALUES ('Terceiro sem identidade', format('%s foi desligado no IAM, mas não tem e-mail — nenhuma conta foi desabilitada.', v_t.nome),
              'critico', 'identidade_incompleta', 'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
    END IF;
    INSERT INTO eventos_jml (tipo, status, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('leaver', 'executado', v_t.nome, p_origem,
            jsonb_build_object('terceiro_id', p_terceiro_id, 'nome', v_t.nome, 'email', v_t.email, 'contrato_fim', v_t.contrato_fim,
                               'tipo_desativacao', 'hard', 'perfis', to_jsonb(v_perfis), 'recursos_individuais', COALESCE(v_indiv->'snapshot','[]'::jsonb)),
            jsonb_build_object('ativo', false, 'motivo', p_motivo, 'operador', v_req,
                               'remocoes_perfil', v_rem, 'remocoes_individuais', COALESCE((v_indiv->>'enfileirados')::int,0)));
    INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('desligar_terceiro', 'terceiros', p_terceiro_id::text, v_req,
            format('Terceiro %s desligado (%s) — %s perfis revogados, %s remoções enfileiradas', v_t.nome, p_origem,
                   COALESCE(array_length(v_perfis,1),0), v_rem + COALESCE((v_indiv->>'enfileirados')::int,0)),
            jsonb_build_object('motivo', p_motivo, 'origem', p_origem));
    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES (CASE WHEN p_origem = 'auto_expiracao' THEN 'Terceiro expirado: ' || v_t.nome ELSE 'Terceiro desligado' END,
            format('%s%s foi desligado (%s). %s perfis revogados; conta e acessos enfileirados para remoção.',
                   v_t.nome, CASE WHEN v_t.empresa_terceira IS NOT NULL THEN ' (' || v_t.empresa_terceira || ')' ELSE '' END,
                   COALESCE(p_motivo, p_origem), COALESCE(array_length(v_perfis,1),0)),
            'aviso'::severidade_alerta, CASE WHEN p_origem = 'auto_expiracao' THEN 'terceiro_expirado' ELSE 'terceiro_desligado' END,
            'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
    RETURN jsonb_build_object('ok', true, 'perfisRevogados', COALESCE(array_length(v_perfis,1),0),
                              'remocoes', v_rem + COALESCE((v_indiv->>'enfileirados')::int,0));
  END IF;

  -- reativação
  UPDATE terceiros SET ativo = true WHERE id = p_terceiro_id;
  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'update',
      jsonb_build_object('status','enabled','motivo', p_motivo,'changed_fields', jsonb_build_array('status'),'new_values', jsonb_build_object('status','enabled')),
      'ad_account:' || v_sam, v_req, v_st);
  END IF;
  IF v_target IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'enable_entra', jsonb_build_object('motivo', p_motivo), 'entra_account:' || v_target, v_req, v_st);
  END IF;
  SELECT dados_antes INTO v_last FROM eventos_jml
   WHERE tipo = 'leaver' AND (dados_antes->>'terceiro_id')::uuid = p_terceiro_id ORDER BY created_at DESC LIMIT 1;
  FOR v_p IN SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(v_last->'perfis','[]'::jsonb)) x LOOP
    IF EXISTS (SELECT 1 FROM perfis_acesso WHERE id = v_p AND ativo)
       AND NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE terceiro_id = p_terceiro_id AND perfil_id = v_p AND ativo) THEN
      INSERT INTO perfil_atribuicoes (perfil_id, terceiro_id, origem, ativo) VALUES (v_p, p_terceiro_id, 'reativacao', true);
      v_pf_rest := v_pf_rest + 1;
    END IF;
  END LOOP;
  IF v_pf_rest > 0 THEN
    PERFORM public.iam_enqueue_profile_actions(NULL, p_terceiro_id, public.iam_active_perfil_ids(NULL, p_terceiro_id), 'assign', v_req, v_st, 'reativacao');
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_last->'recursos_individuais','[]'::jsonb)) LOOP
    IF public.iam_queue_insert(v_id, v_item->>'action_type', COALESCE(v_item->'payload_json','{}'::jsonb),
         COALESCE(v_item->>'resource_key', public.iam_queue_resource_key(v_item->>'action_type', v_item->'payload_json', NULL)),
         COALESCE(v_item->>'requested_by','manual_individual'), 'waiting_approval', jsonb_build_object('reason','restauracao_reativacao'))
    THEN v_restored := v_restored + 1; END IF;
  END LOOP;
  INSERT INTO eventos_jml (tipo, status, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('joiner', 'executado', v_t.nome, p_origem, jsonb_build_object('terceiro_id', p_terceiro_id, 'ativo', false),
          jsonb_build_object('ativo', true, 'perfis_restaurados', v_pf_rest, 'recursos_individuais_restaurados', v_restored, 'operador', v_req));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('reativar_terceiro', 'terceiros', p_terceiro_id::text, v_req,
          format('Terceiro %s reativado — %s perfis e %s recursos individuais restaurados (aguardando aprovação)', v_t.nome, v_pf_rest, v_restored));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Terceiro reativado', format('%s foi reativado com %s perfis e %s recursos individuais (reabilitação aguarda aprovação).', v_t.nome, v_pf_rest, v_restored),
          'info', 'terceiro_reativado', 'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
  RETURN jsonb_build_object('ok', true, 'perfisRestaurados', v_pf_rest, 'individuaisRestaurados', v_restored);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.iam_param(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_provisionar_cargo(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jml_alterar_cargo(uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_alterar_status(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_pre_leaver(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_pre_leaver_reverter(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terceiro_alterar_status(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_param(text, text),
  public.jml_alterar_cargo(uuid, uuid, text, text, uuid, boolean),
  public.jml_alterar_status(uuid, text, text, text, text, boolean),
  public.jml_pre_leaver(uuid, text, text), public.jml_pre_leaver_reverter(uuid, text, text),
  public.terceiro_alterar_status(uuid, boolean, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jml_provisionar_cargo(uuid, uuid, text, text) TO service_role;
