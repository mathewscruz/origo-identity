-- Fluxo permanente de reativação IAM/AD/Entra e restauração de acessos.
-- Snapshot pré-desligamento preservado por 45 dias; perfis exatos restauram grupos
-- e licenças herdadas; somente licenças individuais seguem para atribuição direta.

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
  v_restore_perfis uuid[] := '{}';
  v_perfis_restored int := 0;
  v_profile_items int := 0;
  v_individual_skipped_inherited int := 0;
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
  -- Férias/afastamento são estados ativos: nunca desabilitam AD/Entra nem revogam acessos.
  v_soft  := false;
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
                               'remocoes_perfil', v_rem_perfis, 'remocoes_individuais', COALESCE((v_indiv->>'enfileirados')::int, 0),
                               'backup_retention_until', CASE WHEN v_hard THEN now() + interval '45 days' ELSE NULL END));
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

    -- Restaura o snapshot anterior ao desligamento hard, nunca o estado vazio posterior.
    SELECT dados_antes INTO v_last FROM eventos_jml
     WHERE colaborador_id = p_colaborador_id AND tipo = 'leaver'
       AND dados_antes->>'tipo_desativacao' = 'hard'
     ORDER BY created_at DESC LIMIT 1;

    IF v_last IS NOT NULL THEN
      SELECT COALESCE(array_agg(x.value::uuid), '{}'::uuid[]) INTO v_restore_perfis
      FROM jsonb_array_elements_text(COALESCE(v_last->'perfis', '[]'::jsonb)) AS x(value);
    END IF;

    -- Perfis exatos recuperam grupos e licenças herdadas. O cargo atual é apenas fallback.
    IF COALESCE(array_length(v_restore_perfis, 1), 0) > 0 THEN
      UPDATE perfil_atribuicoes
         SET ativo = true, data_revogacao = NULL
       WHERE colaborador_id = p_colaborador_id
         AND perfil_id = ANY(v_restore_perfis)
         AND ativo = false;
      GET DIAGNOSTICS v_perfis_restored = ROW_COUNT;
      v_profile_items := public.iam_enqueue_profile_actions(
        p_colaborador_id, NULL, v_restore_perfis, 'assign', v_req, 'pending', 'reactivation_restore');
      v_prov := jsonb_build_object('fonte', 'snapshot_pre_desligamento',
                                   'perfis_restaurados', v_perfis_restored,
                                   'itens_enfileirados', v_profile_items);
    ELSIF NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE colaborador_id = p_colaborador_id AND ativo)
          AND v_c.cargo_id IS NOT NULL THEN
      v_prov := public.jml_provisionar_cargo(p_colaborador_id, v_c.cargo_id, v_req, 'pending');
    END IF;

    -- Recursos individuais voltam com aprovação. Licenças herdadas são recuperadas
    -- pelo grupo/perfil correspondente e nunca viram atribuição direta duplicada.
    IF v_last IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_last->'recursos_individuais', '[]'::jsonb)) LOOP
        IF v_item->>'action_type' = 'assign_license'
           AND COALESCE(v_item->'payload_json'->>'assignmentSource', '') = 'group' THEN
          v_individual_skipped_inherited := v_individual_skipped_inherited + 1;
          CONTINUE;
        END IF;
        IF public.iam_queue_insert(v_id, v_item->>'action_type', COALESCE(v_item->'payload_json', '{}'::jsonb),
             COALESCE(v_item->>'resource_key', public.iam_queue_resource_key(v_item->>'action_type', v_item->'payload_json', NULL)),
             COALESCE(v_item->>'requested_by', 'manual_individual'), 'waiting_approval',
             jsonb_build_object('reason', 'restauracao_reativacao', 'snapshot', 'pre_desligamento'))
        THEN v_restored := v_restored + 1; END IF;
      END LOOP;
    END IF;

    v_evento_tipo := CASE WHEN v_old IN ('inativo','desligado') THEN 'joiner' ELSE 'mover' END;
    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES (v_evento_tipo::tipo_evento_jml, 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('status', v_old),
            jsonb_build_object('status', v_new, 'motivo', p_motivo, 'operador', v_req, 'retorno', v_old IN ('ferias','afastado'),
                               'recursos_individuais_restaurados', v_restored,
                               'licencas_herdadas_nao_duplicadas', v_individual_skipped_inherited,
                               'perfis_restaurados', v_perfis_restored,
                               'itens_perfil_enfileirados', v_profile_items,
                               'cargo_reprovisionado', v_prov));
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
    'perfis_restaurados', v_perfis_restored,
    'itens_perfil_enfileirados', v_profile_items,
    'licencas_herdadas_nao_duplicadas', v_individual_skipped_inherited,
    'gestor_email', v_gestor_email, 'gestor_nome', v_gestor_nome);
END;
$$;


REVOKE ALL ON FUNCTION public.jml_alterar_status(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jml_alterar_status(uuid, text, text, text, text, boolean) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
