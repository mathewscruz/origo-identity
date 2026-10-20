ALTER TABLE public.agent_tasks ADD COLUMN IF NOT EXISTS payload jsonb, ADD COLUMN IF NOT EXISTS result_json jsonb;
CREATE INDEX IF NOT EXISTS agent_tasks_analise_app_idx ON public.agent_tasks ((payload->>'aplicacao_id')) WHERE task = 'analyze-app-docs';

-- Painel pede ao Hermes para analisar link/arquivo de um sistema
CREATE OR REPLACE FUNCTION public.app_analise_solicitar(p_aplicacao_id uuid, p_url text DEFAULT NULL, p_arquivo_path text DEFAULT NULL, p_arquivo_nome text DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_op text;
BEGIN
  IF NOT (current_user IN ('postgres','service_role') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  IF p_url IS NULL AND p_arquivo_path IS NULL THEN RAISE EXCEPTION 'informe um link ou um arquivo'; END IF;
  IF p_url IS NOT NULL AND p_url !~* '^https?://' THEN RAISE EXCEPTION 'link inválido'; END IF;
  IF p_arquivo_path IS NOT NULL AND split_part(p_arquivo_path,'/',1) <> p_aplicacao_id::text THEN RAISE EXCEPTION 'arquivo inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.aplicacoes WHERE id = p_aplicacao_id) THEN RAISE EXCEPTION 'aplicacao_inexistente'; END IF;
  SELECT email INTO v_op FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.agent_tasks (task, requested_by, payload)
  VALUES ('analyze-app-docs', COALESCE(v_op,'assistente'), jsonb_build_object('aplicacao_id', p_aplicacao_id, 'url', p_url, 'arquivo_path', p_arquivo_path, 'arquivo_nome', p_arquivo_nome, 'observacao', left(p_observacao, 2000)))
  RETURNING id INTO v_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('app_analise_solicitada','aplicacoes',p_aplicacao_id::text,COALESCE(v_op,'assistente'),'Análise de documentação pedida ao Hermes');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.app_analise_solicitar(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_analise_solicitar(uuid,text,text,text,text) TO authenticated, service_role;

-- Hermes devolve o diagnóstico
CREATE OR REPLACE FUNCTION public.app_analise_concluir(p_id uuid, p_diagnostico jsonb, p_erro text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE='42501';
  END IF;
  UPDATE public.agent_tasks SET status = CASE WHEN p_erro IS NULL THEN 'done' ELSE 'error' END,
    finished_at = now(), http_status = CASE WHEN p_erro IS NULL THEN 200 ELSE 422 END,
    result = left(COALESCE(p_erro, 'diagnóstico entregue'), 2000), result_json = p_diagnostico
  WHERE id = p_id AND task = 'analyze-app-docs' AND status IN ('running','pending');
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.app_analise_concluir(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_analise_concluir(uuid,jsonb,text) TO authenticated;

-- claim devolve payload
CREATE OR REPLACE FUNCTION public.agent_task_claim(p_owner text, p_limit integer DEFAULT 5)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    FROM c WHERE t.id=c.id RETURNING t.id, t.task, t.requested_by, t.created_at, t.payload
  ) SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) INTO v_rows FROM u;
  RETURN jsonb_build_object('agent_paused', false, 'tasks', v_rows);
END $function$;

-- arquivos de documentação
CREATE POLICY "Staff envia docs de sistemas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='app-docs' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin')));
CREATE POLICY "Staff lê docs de sistemas" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='app-docs' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin')));