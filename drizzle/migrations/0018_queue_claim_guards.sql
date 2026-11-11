CREATE OR REPLACE FUNCTION public.iam_queue_pre_claim_guards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $f$
DECLARE r record;
BEGIN
  -- 1) create_if_not_exists for identities that already have an Entra account: close as already existing
  FOR r IN
    SELECT q.id, q.target_identity, COALESCE(c.entra_id, t.entra_id) AS eid
    FROM public.iam_queue q
    LEFT JOIN public.colaboradores c ON c.id=q.colaborador_id
    LEFT JOIN public.terceiros t ON t.id=q.terceiro_id
    WHERE q.action_type='create_if_not_exists'
      AND (q.status='pending' OR (q.status='processing' AND q.lease_expires_at<=now()))
      AND COALESCE(c.entra_id, t.entra_id) IS NOT NULL
  LOOP
    UPDATE public.iam_queue SET status='success', processed_at=now(),
      result_message='Conta já existente no Entra ('||r.eid||'); criação dispensada.',
      claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.auditoria(acao, detalhes) VALUES ('iam_queue_create_already_exists',
      jsonb_build_object('queue_id',r.id,'target',r.target_identity,'entra_id',r.eid));
  END LOOP;

  -- 2) items claimed 3+ times whose lease expired without an answer: mark failed + alert
  FOR r IN
    SELECT id, action_type, target_identity, claim_attempts FROM public.iam_queue
    WHERE status='processing' AND lease_expires_at<=now() AND COALESCE(claim_attempts,0)>=3
  LOOP
    UPDATE public.iam_queue SET status='failed', error_code='agent_no_response', processed_at=now(),
      result_message='Hermes pegou o item '||r.claim_attempts||' vezes sem responder.',
      claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.alertas(tipo, severidade, titulo, mensagem, ref_tipo, ref_id, ref_url)
    VALUES ('fila_sem_resposta','aviso'::public.severidade_alerta,
      'Hermes sem resposta: '||COALESCE(r.target_identity,''),
      'O item "'||r.action_type||'" foi pego '||r.claim_attempts||' vezes sem retorno e foi marcado como falha.',
      'iam_queue', r.id::text, '/fila-provisionamento?tab=fila&sel='||r.id);
  END LOOP;
END $f$;

REVOKE ALL ON FUNCTION public.iam_queue_pre_claim_guards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iam_queue_pre_claim_guards() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_iam_queue_items(p_owner text, p_limit integer DEFAULT 1, p_lease_seconds integer DEFAULT 1800, p_action_types text[] DEFAULT NULL::text[])
 RETURNS SETOF iam_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1),1),10);
  v_lease integer := LEAST(GREATEST(COALESCE(p_lease_seconds,1800),300),1800);
  v_operating_mode text; v_execution_mode text; v_agent_paused text; v_allowed_actions text[];
BEGIN
  IF COALESCE(p_owner,'')='' THEN RAISE EXCEPTION 'claim_owner_required'; END IF;
  IF COALESCE(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_role_required' USING ERRCODE='42501';
  END IF;
  SELECT valor INTO v_operating_mode FROM public.parametros WHERE chave='modo_operacao';
  SELECT valor INTO v_agent_paused FROM public.parametros WHERE chave='agent_paused';
  IF COALESCE(v_operating_mode,'')<>'producao'
     OR lower(COALESCE(v_agent_paused,'')) IN ('1','true','yes','sim','paused','pausado') THEN
    RETURN;
  END IF;
  PERFORM public.iam_queue_pre_claim_guards();
  SELECT valor INTO v_execution_mode FROM public.parametros WHERE chave='iam_execution_mode';
  v_allowed_actions:=ARRAY['create','create_if_not_exists','update','disable','reset_password'];
  IF v_execution_mode='agent_orchestrated' THEN
    v_allowed_actions:=v_allowed_actions||ARRAY['disable_entra','enable_entra','update_entra','assign_license','remove_license','enable_litigation_hold','assign_group','remove_group','assign_app','remove_app','assign_sharepoint','remove_sharepoint','create_user_app','update_user_app','disable_user_app','delete_user_app'];
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT q.id FROM public.iam_queue q
    WHERE ((q.status='pending' AND (q.next_retry_at IS NULL OR q.next_retry_at<=now())) OR (q.status='processing' AND q.lease_expires_at IS NOT NULL AND q.lease_expires_at<=now()))
      AND q.action_type=ANY(v_allowed_actions)
      AND COALESCE(q.requested_by,'')<>'manual_individual'
      AND NOT (q.requested_by='reconciliacao' AND q.created_at>='2026-11-10 14:28:00+00'::timestamptz AND q.created_at<'2026-11-10 14:50:00+00'::timestamptz)
      AND q.id NOT IN ('0424d50f-9282-4790-ac1e-8b27d00d4207'::uuid, 'e2911374-95c8-44d4-8b62-bd12be598156'::uuid)
      AND (p_action_types IS NULL OR q.action_type=ANY(p_action_types))
    ORDER BY q.created_at ASC FOR UPDATE SKIP LOCKED LIMIT v_limit
  ), claimed AS (
    UPDATE public.iam_queue q SET status='processing',claim_token=gen_random_uuid(),claimed_at=now(),lease_expires_at=now()+make_interval(secs=>v_lease),claim_owner=p_owner,claim_attempts=COALESCE(q.claim_attempts,0)+1,processed_by=p_owner FROM candidates c WHERE q.id=c.id RETURNING q.*
  ) SELECT * FROM claimed;
END;
$function$;