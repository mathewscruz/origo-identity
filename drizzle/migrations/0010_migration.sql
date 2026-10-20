CREATE OR REPLACE FUNCTION public.agent_task_claim(p_owner text, p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  IF lower(COALESCE(public.iam_param('agent_paused','false'),'false')) IN ('true','1','sim') THEN
    RETURN jsonb_build_object('agent_paused', true, 'tasks', '[]'::jsonb);
  END IF;
  UPDATE public.agent_tasks SET status='pending', started_at=NULL, owner=NULL
   WHERE status='running' AND started_at < now() - interval '30 minutes';
  WITH c AS (
    SELECT id FROM public.agent_tasks WHERE status='pending' ORDER BY created_at
    LIMIT LEAST(GREATEST(p_limit,1),10) FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE public.agent_tasks t SET status='running', started_at=now(), owner=COALESCE(p_owner,'hermes-mcp')
    FROM c WHERE t.id=c.id RETURNING t.id, t.task, t.requested_by, t.created_at
  ) SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) INTO v_rows FROM u;
  RETURN jsonb_build_object('agent_paused', false, 'tasks', v_rows);
END $$;

CREATE OR REPLACE FUNCTION public.agent_task_finish(p_id uuid, p_status text, p_http_status integer, p_result text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  IF p_status NOT IN ('success','failed') THEN RAISE EXCEPTION 'status_invalido'; END IF;
  UPDATE public.agent_tasks SET status=p_status, finished_at=now(), http_status=p_http_status, result=left(p_result, 4000)
   WHERE id=p_id AND status='running';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.agent_task_claim(text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_task_finish(uuid,text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_task_claim(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_task_finish(uuid,text,integer,text) TO authenticated;