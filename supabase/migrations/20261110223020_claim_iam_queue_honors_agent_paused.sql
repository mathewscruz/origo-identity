-- Fail closed: direct queue claims must honor the operator pause switch.
CREATE OR REPLACE FUNCTION public.claim_iam_queue_items(
  p_owner text,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 1800,
  p_action_types text[] DEFAULT NULL::text[]
)
RETURNS SETOF public.iam_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1),1),10);
  v_lease integer := LEAST(GREATEST(COALESCE(p_lease_seconds,1800),300),1800);
  v_operating_mode text; v_execution_mode text; v_agent_paused text; v_allowed_actions text[];
BEGIN
  IF COALESCE(p_owner,'')='' THEN RAISE EXCEPTION 'claim_owner_required'; END IF;
  IF COALESCE(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'admin_role_required' USING ERRCODE='42501'; END IF;
  SELECT valor INTO v_operating_mode FROM public.parametros WHERE chave='modo_operacao';
  SELECT valor INTO v_agent_paused FROM public.parametros WHERE chave='agent_paused';
  IF COALESCE(v_operating_mode,'')<>'producao' OR lower(COALESCE(v_agent_paused,'')) IN ('1','true','yes','sim','paused','pausado') THEN RETURN; END IF;
  SELECT valor INTO v_execution_mode FROM public.parametros WHERE chave='iam_execution_mode';
  v_allowed_actions:=ARRAY['create','create_if_not_exists','update','disable','reset_password'];
  IF v_execution_mode='agent_orchestrated' THEN
    v_allowed_actions:=v_allowed_actions||ARRAY['disable_entra','enable_entra','update_entra','assign_license','remove_license','enable_litigation_hold','assign_group','remove_group','assign_app','remove_app','assign_sharepoint','remove_sharepoint','create_user_app','update_user_app','disable_user_app','delete_user_app'];
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT q.id FROM public.iam_queue q WHERE ((q.status='pending' AND (q.next_retry_at IS NULL OR q.next_retry_at<=now())) OR (q.status='processing' AND q.lease_expires_at IS NOT NULL AND q.lease_expires_at<=now())) AND q.action_type=ANY(v_allowed_actions) AND COALESCE(q.requested_by,'')<>'manual_individual' AND NOT (q.requested_by='reconciliacao' AND q.created_at>='2026-11-10 14:28:00+00'::timestamptz AND q.created_at<'2026-11-10 14:50:00+00'::timestamptz) AND q.id NOT IN ('0424d50f-9282-4790-ac1e-8b27d00d4207'::uuid,'e2911374-95c8-44d4-8b62-bd12be598156'::uuid) AND (p_action_types IS NULL OR q.action_type=ANY(p_action_types)) ORDER BY q.created_at ASC FOR UPDATE SKIP LOCKED LIMIT v_limit
  ), claimed AS (
    UPDATE public.iam_queue q SET status='processing',claim_token=gen_random_uuid(),claimed_at=now(),lease_expires_at=now()+make_interval(secs=>v_lease),claim_owner=p_owner,claim_attempts=COALESCE(q.claim_attempts,0)+1,processed_by=p_owner FROM candidates c WHERE q.id=c.id RETURNING q.*
  ) SELECT * FROM claimed;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_iam_queue_items(text,integer,integer,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_iam_queue_items(text,integer,integer,text[]) TO service_role, authenticated;
