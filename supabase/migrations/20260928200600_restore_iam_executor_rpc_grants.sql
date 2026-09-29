-- Restaura os privilégios mínimos do executor autenticado e endurece o heartbeat.
-- Necessário após o read-back do claim_token=uuid: o PostgREST ainda retornava
-- 42501 "permission denied for function claim_iam_queue_items".

CREATE OR REPLACE FUNCTION public.iam_agent_heartbeat(
  p_owner text,
  p_kind text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false) THEN
    RAISE EXCEPTION 'admin_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_owner IS NULL
     OR length(p_owner) NOT BETWEEN 1 AND 160
     OR p_kind NOT IN ('claim', 'result', 'cycle') THEN
    RAISE EXCEPTION 'invalid_heartbeat';
  END IF;

  p_details := jsonb_build_object(
    'version', left(p_details->>'version', 80),
    'host', left(p_details->>'host', 160),
    'execute', (p_details->>'execute')::boolean,
    'cycle_ok', (p_details->>'cycle_ok')::boolean,
    'pending', (p_details->>'pending')::integer,
    'result', left(p_details->>'result', 300)
  );

  INSERT INTO public.iam_agent_status (
    owner, last_seen_at, last_claim_at, last_result_at, last_result,
    version, host, execute_mode, details
  )
  VALUES (
    p_owner,
    now(),
    CASE WHEN p_kind = 'claim' THEN now() END,
    CASE WHEN p_kind = 'result' THEN now() END,
    CASE WHEN p_kind = 'result' THEN p_details->>'result' END,
    p_details->>'version',
    p_details->>'host',
    (p_details->>'execute')::boolean,
    p_details
  )
  ON CONFLICT (owner) DO UPDATE SET
    last_seen_at = now(),
    last_claim_at = CASE WHEN p_kind = 'claim' THEN now() ELSE iam_agent_status.last_claim_at END,
    last_result_at = CASE WHEN p_kind = 'result' THEN now() ELSE iam_agent_status.last_result_at END,
    last_result = CASE WHEN p_kind = 'result' THEN p_details->>'result' ELSE iam_agent_status.last_result END,
    version = COALESCE(p_details->>'version', iam_agent_status.version),
    host = COALESCE(p_details->>'host', iam_agent_status.host),
    execute_mode = COALESCE((p_details->>'execute')::boolean, iam_agent_status.execute_mode),
    details = iam_agent_status.details || p_details;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_iam_queue_item(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_iam_queue_item(uuid, uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT json_build_object(
  'status', CASE WHEN
    has_function_privilege('authenticated', 'public.claim_iam_queue_items(text,integer,integer,text[])', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.complete_iam_queue_item(uuid,uuid,text,text,text,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.iam_agent_heartbeat(text,text,jsonb)', 'EXECUTE')
    THEN 'committed' ELSE 'invalid' END,
  'migration', '20260928200600',
  'claim_execute', has_function_privilege('authenticated', 'public.claim_iam_queue_items(text,integer,integer,text[])', 'EXECUTE'),
  'complete_execute', has_function_privilege('authenticated', 'public.complete_iam_queue_item(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'heartbeat_execute', has_function_privilege('authenticated', 'public.iam_agent_heartbeat(text,text,jsonb)', 'EXECUTE')
) AS iam_executor_grants_readback;
