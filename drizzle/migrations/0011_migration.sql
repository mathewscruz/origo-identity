CREATE OR REPLACE FUNCTION public.agent_task_finish(p_id uuid, p_status text, p_http_status integer, p_result text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  IF p_status NOT IN ('done','error') THEN RAISE EXCEPTION 'status_invalido'; END IF;
  UPDATE public.agent_tasks SET status=p_status, finished_at=now(), http_status=p_http_status, result=left(p_result, 2000)
   WHERE id=p_id AND status='running';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.alertas_marcar_notificados(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  UPDATE public.alertas SET notificado_em=now() WHERE id = ANY(p_ids) AND notificado_em IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.alertas_marcar_notificados(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alertas_marcar_notificados(uuid[]) TO authenticated;