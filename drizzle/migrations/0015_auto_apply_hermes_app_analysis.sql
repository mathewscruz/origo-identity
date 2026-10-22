-- Apply the sanitized Hermes diagnosis to the application draft.
-- Credentials are never accepted here; only allow-listed configuration fields
-- are copied from result_json. The application remains inactive until its
-- protected credential and connection test are completed.
CREATE OR REPLACE FUNCTION public.app_analise_concluir(
  p_id uuid,
  p_diagnostico jsonb,
  p_erro text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app_id uuid;
  v_mode text;
  v_auth text;
  v_base_url text;
  v_actions jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_profile text;
  v_group_id uuid;
  v_group_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;

  SELECT (payload->>'aplicacao_id')::uuid
    INTO v_app_id
    FROM public.agent_tasks
   WHERE id = p_id
     AND task = 'analyze-app-docs'
     AND status IN ('running','pending')
   FOR UPDATE;

  IF v_app_id IS NULL THEN
    RETURN false;
  END IF;

  p_diagnostico := COALESCE(p_diagnostico, '{}'::jsonb);

  IF p_erro IS NULL THEN
    v_mode := p_diagnostico->>'modo_sugerido';
    IF v_mode NOT IN ('grupo','api','manual') THEN
      v_mode := NULL;
    END IF;

    UPDATE public.aplicacoes
       SET modo_acesso = COALESCE(v_mode, modo_acesso),
           connector_type = CASE
             WHEN v_mode = 'api' THEN 'rest_api'
             WHEN v_mode = 'manual' THEN 'manual'
             ELSE connector_type
           END,
           instrucoes_acesso = COALESCE(NULLIF(left(p_diagnostico->>'instrucoes_acesso', 3000), ''), instrucoes_acesso),
           instrucoes_revogacao = COALESCE(NULLIF(left(p_diagnostico->>'instrucoes_revogacao', 3000), ''), instrucoes_revogacao),
           teste_status = 'pendente',
           updated_at = now()
     WHERE id = v_app_id;

    IF v_mode = 'api' THEN
      v_base_url := NULLIF(left(p_diagnostico->>'api_base_url', 500), '');
      IF v_base_url IS NOT NULL AND v_base_url !~* '^https://' THEN
        v_base_url := NULL;
      END IF;

      v_auth := p_diagnostico->>'auth_type';
      IF v_auth NOT IN ('bearer','api_key','basic','oauth2_client_credentials','app_token') THEN
        v_auth := NULL;
      END IF;

      IF jsonb_typeof(p_diagnostico->'actions') = 'object' THEN
        v_actions := p_diagnostico->'actions';
      END IF;

      v_patch := jsonb_strip_nulls(jsonb_build_object(
        'base_url', v_base_url,
        'auth_type', v_auth,
        'actions', v_actions
      ));

      IF v_patch <> '{}'::jsonb THEN
        INSERT INTO public.aplicacao_connectors (aplicacao_id, config, updated_at)
        VALUES (v_app_id, v_patch, now())
        ON CONFLICT (aplicacao_id) DO UPDATE
          SET config = COALESCE(public.aplicacao_connectors.config, '{}'::jsonb) || EXCLUDED.config,
              updated_at = now();
      END IF;
    ELSIF v_mode = 'grupo' AND NULLIF(btrim(p_diagnostico->>'grupo_nome'), '') IS NOT NULL THEN
      SELECT count(*), min(id)
        INTO v_group_count, v_group_id
        FROM public.entra_grupos
       WHERE lower(nome) = lower(left(btrim(p_diagnostico->>'grupo_nome'), 200));
      IF v_group_count = 1 THEN
        UPDATE public.aplicacoes SET grupo_id = v_group_id, updated_at = now() WHERE id = v_app_id;
      END IF;
    END IF;

    IF jsonb_typeof(p_diagnostico->'perfis') = 'array' THEN
      FOR v_profile IN
        SELECT DISTINCT left(btrim(value), 120)
          FROM jsonb_array_elements_text(p_diagnostico->'perfis') AS x(value)
         WHERE NULLIF(btrim(value), '') IS NOT NULL
      LOOP
        INSERT INTO public.aplicacao_perfis_internos (aplicacao_id, nome_externo)
        SELECT v_app_id, v_profile
         WHERE NOT EXISTS (
           SELECT 1
             FROM public.aplicacao_perfis_internos p
            WHERE p.aplicacao_id = v_app_id
              AND lower(p.nome_externo) = lower(v_profile)
         );
      END LOOP;
    END IF;
  END IF;

  UPDATE public.agent_tasks
     SET status = CASE WHEN p_erro IS NULL THEN 'done' ELSE 'error' END,
         finished_at = now(),
         http_status = CASE WHEN p_erro IS NULL THEN 200 ELSE 422 END,
         result = left(COALESCE(p_erro, 'diagnóstico entregue e aplicado à ficha'), 2000),
         result_json = p_diagnostico,
         payload = CASE WHEN p_erro IS NULL
           THEN COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
             'aplicado_em', now(),
             'aplicado_por', 'hermes-agent'
           )
           ELSE payload
         END
   WHERE id = p_id;

  IF p_erro IS NULL THEN
    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES (
      'app_analise_aplicada',
      'aplicacoes',
      v_app_id::text,
      'hermes-agent',
      'Diagnóstico do Hermes aplicado automaticamente à ficha do sistema',
      jsonb_build_object('agent_task_id', p_id, 'modo', v_mode, 'credenciais_incluidas', false)
    );
  END IF;

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.app_analise_concluir(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_analise_concluir(uuid,jsonb,text) TO authenticated;
