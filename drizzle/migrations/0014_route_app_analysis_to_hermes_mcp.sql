-- Reserve LLM-assisted application analysis for the Hermes MCP worker.
-- Deterministic local workers must not claim analyze-app-docs because they
-- can execute Edge Functions but cannot inspect documentation or submit the
-- structured diagnosis expected by app_analise_concluir.
CREATE OR REPLACE FUNCTION public.agent_task_claim(p_owner text, p_limit integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_owner text := COALESCE(NULLIF(btrim(p_owner), ''), 'hermes-mcp');
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;

  IF lower(COALESCE(public.iam_param('agent_paused','false'),'false')) IN ('true','1','sim') THEN
    RETURN jsonb_build_object('agent_paused', true, 'tasks', '[]'::jsonb);
  END IF;

  UPDATE public.agent_tasks
     SET status='pending', started_at=NULL, owner=NULL
   WHERE status='running'
     AND started_at < now() - interval '30 minutes';

  WITH c AS (
    SELECT id
      FROM public.agent_tasks
     WHERE status='pending'
       AND (task <> 'analyze-app-docs' OR v_owner = 'hermes-mcp')
     ORDER BY created_at
     LIMIT LEAST(GREATEST(p_limit,1),10)
     FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE public.agent_tasks t
       SET status='running', started_at=now(), owner=v_owner
      FROM c
     WHERE t.id=c.id
    RETURNING t.id, t.task, t.requested_by, t.created_at, t.payload
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
    INTO v_rows
    FROM u;

  RETURN jsonb_build_object('agent_paused', false, 'tasks', v_rows);
END
$function$;

REVOKE ALL ON FUNCTION public.agent_task_claim(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_task_claim(text,integer) TO authenticated;
