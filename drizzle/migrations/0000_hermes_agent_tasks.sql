CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  http_status integer,
  result text,
  owner text
);
GRANT SELECT ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view agent tasks" ON public.agent_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'platform_admin'));
CREATE INDEX agent_tasks_pending_idx ON public.agent_tasks (status, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;

CREATE OR REPLACE FUNCTION public.agent_task_solicitar(p_task text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_op text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('sync-sharepoint-csv','reconcile-identities','expire-access-exceptions','auto-recertification',
    'audit-reconciliation','sync-entra-groups','sync-entra-apps','sync-entra-licencas','sync-entra-roles',
    'sync-sharepoint-sites','sync-app-profiles','sync-user-access') THEN
    RAISE EXCEPTION 'task_invalida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_tasks WHERE task = p_task AND status IN ('pending','running')) THEN
    RAISE EXCEPTION 'Já existe um pedido em aberto para esta rotina';
  END IF;
  SELECT email INTO v_op FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.agent_tasks (task, requested_by) VALUES (p_task, COALESCE(v_op, 'sistema')) RETURNING id INTO v_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('agent_task_solicitada', 'agent_tasks', v_id::text, COALESCE(v_op, 'sistema'), 'Execução solicitada ao Hermes: ' || p_task);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.agent_task_solicitar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_task_solicitar(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.iam_agent_heartbeat(p_owner text, p_kind text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false) THEN
    RAISE EXCEPTION 'admin_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 160
     OR p_kind NOT IN ('poll', 'claim', 'result', 'cycle') THEN
    RAISE EXCEPTION 'invalid_heartbeat';
  END IF;
  p_details := jsonb_strip_nulls(jsonb_build_object(
    'version', left(p_details->>'version', 80),
    'host', left(p_details->>'host', 160),
    'execute', (p_details->>'execute')::boolean,
    'cycle_ok', (p_details->>'cycle_ok')::boolean,
    'pending', (p_details->>'pending')::integer,
    'result', left(p_details->>'result', 300)
  ));
  INSERT INTO public.iam_agent_status (owner, last_seen_at, last_claim_at, last_result_at, last_result, version, host, execute_mode, details)
  VALUES (p_owner, now(),
    CASE WHEN p_kind = 'claim' THEN now() END,
    CASE WHEN p_details ? 'result' THEN now() END,
    p_details->>'result',
    p_details->>'version', p_details->>'host', (p_details->>'execute')::boolean, p_details)
  ON CONFLICT (owner) DO UPDATE SET
    last_seen_at = now(),
    last_claim_at = CASE WHEN p_kind = 'claim' THEN now() ELSE iam_agent_status.last_claim_at END,
    last_result_at = CASE WHEN p_details ? 'result' THEN now() ELSE iam_agent_status.last_result_at END,
    last_result = COALESCE(p_details->>'result', iam_agent_status.last_result),
    version = COALESCE(p_details->>'version', iam_agent_status.version),
    host = COALESCE(p_details->>'host', iam_agent_status.host),
    execute_mode = COALESCE((p_details->>'execute')::boolean, iam_agent_status.execute_mode),
    details = iam_agent_status.details || p_details;
END;
$function$;

INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('agent_paused', 'false', 'Pausa de emergência: o Hermes para de reservar itens da fila e tarefas'),
  ('agent_expected_version', '', 'Versão esperada do Hermes Agent (vazio = não verificar)')
ON CONFLICT (chave) DO NOTHING;