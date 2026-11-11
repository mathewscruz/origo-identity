CREATE OR REPLACE FUNCTION public.iam_step_order(p_action text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_action
    WHEN 'create' THEN 1 WHEN 'create_if_not_exists' THEN 1
    WHEN 'replicate_entra' THEN 2
    WHEN 'assign_license' THEN 3
    WHEN 'assign_group' THEN 4
    WHEN 'assign_app' THEN 5 WHEN 'assign_sharepoint' THEN 5 WHEN 'create_user_app' THEN 5
    WHEN 'enable_litigation_hold' THEN 6
    WHEN 'send_password_teams' THEN 7
    WHEN 'disable_entra' THEN 8
    WHEN 'disable' THEN 9
    WHEN 'remove_license' THEN 10
    WHEN 'remove_group' THEN 11
    WHEN 'remove_app' THEN 12 WHEN 'remove_sharepoint' THEN 12 WHEN 'disable_user_app' THEN 12
    WHEN 'reply_ticket' THEN 13
    ELSE NULL END
$$;

ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS step_order integer;
UPDATE public.iam_queue SET step_order = public.iam_step_order(action_type)
 WHERE status IN ('pending','processing','waiting_approval','failed') AND step_order IS NULL;
CREATE INDEX IF NOT EXISTS iam_queue_seq_gate_idx ON public.iam_queue (colaborador_id, terceiro_id, step_order) WHERE status IN ('pending','processing','waiting_approval','failed');

CREATE OR REPLACE FUNCTION public.iam_queue_set_step_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.step_order := public.iam_step_order(NEW.action_type);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_iam_queue_set_step_order ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_set_step_order BEFORE INSERT ON public.iam_queue
  FOR EACH ROW EXECUTE FUNCTION public.iam_queue_set_step_order();

-- Generates the sequence-only steps (replicate in Entra, send password, reply ticket)
CREATE OR REPLACE FUNCTION public.iam_queue_sequence_companions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_mgr text; v_requester text; v_ticket text;
BEGIN
  v_ticket := substring(COALESCE(NEW.requested_by,'') from '(?i)glpi[^0-9]*([0-9]+)');
  v_requester := CASE WHEN COALESCE(NEW.requested_by,'') LIKE '%@%' THEN NEW.requested_by END;

  IF NEW.action_type IN ('create','create_if_not_exists') THEN
    IF NEW.colaborador_id IS NOT NULL THEN
      SELECT g.email INTO v_mgr FROM public.colaboradores c JOIN public.colaboradores g ON g.id=c.gestor_id WHERE c.id=NEW.colaborador_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.iam_queue q WHERE q.action_type='replicate_entra'
        AND q.status IN ('pending','processing','waiting_approval')
        AND (q.colaborador_id IS NOT DISTINCT FROM NEW.colaborador_id) AND (q.terceiro_id IS NOT DISTINCT FROM NEW.terceiro_id)) THEN
      INSERT INTO public.iam_queue(action_type,status,payload_json,requested_by,colaborador_id,terceiro_id,target_identity,correlation_id)
      VALUES ('replicate_entra','pending',
        jsonb_build_object('mail',NEW.payload_json->>'mail','userPrincipalName',NEW.payload_json->>'userPrincipalName','samAccountName',NEW.payload_json->>'samAccountName'),
        NEW.requested_by,NEW.colaborador_id,NEW.terceiro_id,NEW.target_identity,NEW.correlation_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.iam_queue q WHERE q.action_type='send_password_teams'
        AND q.status IN ('pending','processing','waiting_approval')
        AND (q.colaborador_id IS NOT DISTINCT FROM NEW.colaborador_id) AND (q.terceiro_id IS NOT DISTINCT FROM NEW.terceiro_id)) THEN
      INSERT INTO public.iam_queue(action_type,status,payload_json,requested_by,colaborador_id,terceiro_id,target_identity,correlation_id)
      VALUES ('send_password_teams','pending',
        jsonb_build_object('mail',NEW.payload_json->>'mail','displayName',NEW.payload_json->>'displayName',
          'recipient',COALESCE(v_requester,v_mgr),'requesterEmail',v_requester,'managerEmail',v_mgr,'ticketId',v_ticket),
        NEW.requested_by,NEW.colaborador_id,NEW.terceiro_id,NEW.target_identity,NEW.correlation_id);
    END IF;
  ELSIF NEW.action_type='disable_entra' AND v_ticket IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.iam_queue q WHERE q.action_type='reply_ticket'
        AND q.status IN ('pending','processing','waiting_approval')
        AND (q.colaborador_id IS NOT DISTINCT FROM NEW.colaborador_id) AND (q.terceiro_id IS NOT DISTINCT FROM NEW.terceiro_id)) THEN
      INSERT INTO public.iam_queue(action_type,status,payload_json,requested_by,colaborador_id,terceiro_id,target_identity,correlation_id)
      VALUES ('reply_ticket','pending', jsonb_build_object('ticketId',v_ticket,'mail',NEW.payload_json->>'mail'),
        NEW.requested_by,NEW.colaborador_id,NEW.terceiro_id,NEW.target_identity,NEW.correlation_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_iam_queue_sequence_companions ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_sequence_companions AFTER INSERT ON public.iam_queue
  FOR EACH ROW WHEN (NEW.action_type IN ('create','create_if_not_exists','disable_entra'))
  EXECUTE FUNCTION public.iam_queue_sequence_companions();

-- Groups that cannot be removed on offboarding are not failures
CREATE OR REPLACE FUNCTION public.iam_queue_group_not_removable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.action_type='remove_group' AND NEW.status='failed' AND OLD.status IS DISTINCT FROM 'failed'
     AND (COALESCE((NEW.payload_json->>'dynamicMembership')::boolean,false)
          OR COALESCE(NEW.result_message,'')||' '||COALESCE(NEW.error_code,'') ~* '(dynamic|din[aâ]mic|insufficient privileges|authorization_requestdenied|on-?premises|synced|mail-enabled|cannot update|not removable|group_not_removable)') THEN
    NEW.status := 'success';
    NEW.error_code := 'group_not_removable';
    NEW.result_message := 'Grupo não removível — ignorado. '||COALESCE(NEW.result_message,'');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_iam_queue_aa_group_not_removable ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_aa_group_not_removable BEFORE UPDATE OF status ON public.iam_queue
  FOR EACH ROW EXECUTE FUNCTION public.iam_queue_group_not_removable();

CREATE OR REPLACE FUNCTION public.iam_queue_pre_claim_guards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $f$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT q.id, q.target_identity, c.entra_id AS eid
    FROM public.iam_queue q JOIN public.colaboradores c ON c.id=q.colaborador_id
    WHERE q.action_type='create_if_not_exists'
      AND (q.status='pending' OR (q.status='processing' AND q.lease_expires_at<=now()))
      AND c.entra_id IS NOT NULL
  LOOP
    UPDATE public.iam_queue SET status='success', processed_at=now(),
      result_message='Conta já existente no Entra ('||r.eid||'); criação dispensada.', claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.auditoria(operador, acao, entidade, entidade_id, resumo, detalhes)
    VALUES ('sistema','iam_queue_create_already_exists','iam_queue',r.id::text,
      'Criação dispensada: conta de '||COALESCE(r.target_identity,'')||' já existe no Entra', jsonb_build_object('entra_id',r.eid));
  END LOOP;

  -- Step 2: replication confirmed once the person has an Entra account (or creation succeeded for third parties)
  UPDATE public.iam_queue q SET status='success', processed_at=now(), result_message='Conta replicada no Entra ID.'
  WHERE q.action_type='replicate_entra' AND q.status='pending'
    AND ( EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id=q.colaborador_id AND c.entra_id IS NOT NULL)
       OR (q.terceiro_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.iam_queue p WHERE p.terceiro_id=q.terceiro_id
             AND p.action_type IN ('create','create_if_not_exists') AND p.status='success' AND p.created_at>=q.created_at-interval '1 minute')) );

  -- Dynamic groups cannot be removed: close as ignored
  UPDATE public.iam_queue SET status='success', processed_at=now(), error_code='group_not_removable',
    result_message='Grupo dinâmico, não removível — ignorado.'
  WHERE action_type='remove_group' AND status='pending' AND COALESCE((payload_json->>'dynamicMembership')::boolean,false);

  FOR r IN
    SELECT id, action_type, target_identity, claim_attempts FROM public.iam_queue
    WHERE status='processing' AND lease_expires_at<=now() AND COALESCE(claim_attempts,0)>=3
  LOOP
    UPDATE public.iam_queue SET status='failed', error_code='agent_no_response', processed_at=now(),
      result_message='Hermes pegou o item '||r.claim_attempts||' vezes sem responder.', claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.alertas(tipo, severidade, titulo, mensagem, ref_tipo, ref_id, ref_url)
    VALUES ('fila_sem_resposta','aviso'::public.severidade_alerta, 'Hermes sem resposta: '||COALESCE(r.target_identity,''),
      'O item "'||r.action_type||'" foi pego '||r.claim_attempts||' vezes sem retorno e foi marcado como falha.',
      'iam_queue', r.id::text, '/fila-provisionamento?tab=fila&sel='||r.id);
  END LOOP;
END $f$;

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
    v_allowed_actions:=v_allowed_actions||ARRAY['disable_entra','enable_entra','update_entra','assign_license','remove_license','enable_litigation_hold','assign_group','remove_group','assign_app','remove_app','assign_sharepoint','remove_sharepoint','create_user_app','update_user_app','disable_user_app','delete_user_app','send_password_teams','reply_ticket'];
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT q.id FROM public.iam_queue q
    WHERE ((q.status='pending' AND (q.next_retry_at IS NULL OR q.next_retry_at<=now())) OR (q.status='processing' AND q.lease_expires_at IS NOT NULL AND q.lease_expires_at<=now()))
      AND q.action_type=ANY(v_allowed_actions)
      AND COALESCE(q.requested_by,'')<>'manual_individual'
      AND NOT (q.requested_by='reconciliacao' AND q.created_at>='2026-11-10 14:28:00+00'::timestamptz AND q.created_at<'2026-11-10 14:50:00+00'::timestamptz)
      AND q.id NOT IN ('0424d50f-9282-4790-ac1e-8b27d00d4207'::uuid, 'e2911374-95c8-44d4-8b62-bd12be598156'::uuid)
      AND (p_action_types IS NULL OR q.action_type=ANY(p_action_types))
      -- fixed sequence: an earlier step of the same flow for the same person must be finished first
      AND (q.step_order IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.iam_queue b
        WHERE b.id<>q.id AND b.step_order IS NOT NULL AND b.step_order<q.step_order
          AND ((q.step_order<=7 AND b.step_order<=7) OR (q.step_order>=8 AND b.step_order>=8))
          AND b.status IN ('pending','processing','waiting_approval','failed')
          AND b.created_at>=now()-interval '7 days'
          AND ((q.colaborador_id IS NOT NULL AND b.colaborador_id=q.colaborador_id)
            OR (q.terceiro_id IS NOT NULL AND b.terceiro_id=q.terceiro_id))))
    ORDER BY q.created_at ASC, q.step_order ASC NULLS LAST FOR UPDATE SKIP LOCKED LIMIT v_limit
  ), claimed AS (
    UPDATE public.iam_queue q SET status='processing',claim_token=gen_random_uuid(),claimed_at=now(),lease_expires_at=now()+make_interval(secs=>v_lease),claim_owner=p_owner,claim_attempts=COALESCE(q.claim_attempts,0)+1,processed_by=p_owner FROM candidates c WHERE q.id=c.id RETURNING q.*
  ) SELECT * FROM claimed;
END;
$function$;