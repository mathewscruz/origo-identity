-- Pedido automático de atualização ao Hermes (throttle por rotina)
CREATE OR REPLACE FUNCTION public.agent_refresh_request(p_task text, p_min_interval_min integer DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last timestamptz; v_open boolean; v_id uuid; v_op text;
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('sync-entra-groups','sync-entra-apps','sync-entra-licencas','sync-entra-roles',
    'sync-sharepoint-sites','sync-app-profiles','quarantine-triage','audit-reconciliation') THEN
    RAISE EXCEPTION 'task_invalida';
  END IF;
  SELECT max(COALESCE(finished_at, created_at)) INTO v_last FROM public.agent_tasks WHERE task = p_task;
  SELECT EXISTS (SELECT 1 FROM public.agent_tasks WHERE task = p_task AND status IN ('pending','running')) INTO v_open;
  IF v_open OR (v_last IS NOT NULL AND v_last > now() - make_interval(mins => GREATEST(p_min_interval_min, 5))) THEN
    RETURN jsonb_build_object('queued', false, 'open', v_open, 'last_at', v_last);
  END IF;
  SELECT email INTO v_op FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.agent_tasks (task, requested_by) VALUES (p_task, COALESCE('auto:' || v_op, 'auto:sistema')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('queued', true, 'id', v_id, 'last_at', v_last);
END $$;
REVOKE ALL ON FUNCTION public.agent_refresh_request(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_refresh_request(text, integer) TO authenticated, service_role;

-- Ao alterar conectores de aplicação, pede atualização dos perfis internos
CREATE OR REPLACE FUNCTION public.trg_agent_refresh_app_profiles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_tasks WHERE task='sync-app-profiles' AND status IN ('pending','running')) THEN
    INSERT INTO public.agent_tasks (task, requested_by) VALUES ('sync-app-profiles', 'auto:alteracao');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS agent_refresh_app_profiles ON public.aplicacao_connectors;
CREATE TRIGGER agent_refresh_app_profiles AFTER INSERT OR UPDATE ON public.aplicacao_connectors
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_agent_refresh_app_profiles();

-- Triagem determinística da quarentena RH (executada pelo Hermes via service_role)
CREATE OR REPLACE FUNCTION public.quarentena_triagem() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dup int := 0; v_desl int := 0; v_rest int := 0;
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  -- 1. Repetições: mantém só a mais recente por motivo + pessoa
  WITH r AS (
    SELECT id, row_number() OVER (PARTITION BY motivo, COALESCE(matricula, colaborador_id::text, lower(email), nome) ORDER BY created_at DESC) rn
      FROM public.colab_quarentena WHERE status = 'pendente'
  ), u AS (
    UPDATE public.colab_quarentena q SET status='descartado', decidido_por='hermes:triagem', decidido_em=now(),
           detalhe = COALESCE(q.detalhe || ' · ', '') || 'Repetição de pendência mais recente'
      FROM r WHERE q.id = r.id AND r.rn > 1 RETURNING 1)
  SELECT count(*) INTO v_dup FROM u;
  -- 2. Ausente no CSV ou erro de atualização de pessoa já desligada: nada a fazer
  WITH u AS (
    UPDATE public.colab_quarentena q SET status='resolvido', decidido_por='hermes:triagem', decidido_em=now(),
           detalhe = COALESCE(q.detalhe || ' · ', '') || 'Pessoa já desligada'
      FROM public.colaboradores c
     WHERE c.id = q.colaborador_id AND q.status='pendente' AND c.status='desligado'
       AND q.motivo IN ('ausente_no_csv','erro_atualizacao') RETURNING 1)
  SELECT count(*) INTO v_desl FROM u;
  SELECT count(*) INTO v_rest FROM public.colab_quarentena WHERE status='pendente';
  IF v_dup + v_desl > 0 THEN
    INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
    VALUES ('quarentena_triagem', 'colab_quarentena', 'hermes',
      format('Hermes revisou a quarentena do RH: %s repetições descartadas, %s já desligados resolvidos, %s precisam de decisão', v_dup, v_desl, v_rest),
      jsonb_build_object('repeticoes', v_dup, 'desligados', v_desl, 'restantes', v_rest));
  END IF;
  RETURN jsonb_build_object('repeticoes', v_dup, 'desligados', v_desl, 'restantes', v_rest);
END $$;
REVOKE ALL ON FUNCTION public.quarentena_triagem() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quarentena_triagem() TO authenticated, service_role;

-- KPIs do dashboard com variação
CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT LEAST(GREATEST(COALESCE(p_days,30),1),365) n),
  q AS (
    SELECT
      count(*) FILTER (WHERE status='success' AND processed_at >= now() - make_interval(days => (SELECT n FROM d))) ok_cur,
      count(*) FILTER (WHERE status='success' AND processed_at <  now() - make_interval(days => (SELECT n FROM d)) AND processed_at >= now() - make_interval(days => 2*(SELECT n FROM d))) ok_prev,
      count(*) FILTER (WHERE status='failed' AND processed_at >= now() - interval '24 hours') fail_24h,
      count(*) FILTER (WHERE status='failed' AND processed_at >= now() - interval '48 hours' AND processed_at < now() - interval '24 hours') fail_prev,
      count(*) FILTER (WHERE status='waiting_approval') aguardando
    FROM public.iam_queue)
  SELECT jsonb_build_object(
    'pessoas_ativas', (SELECT count(*) FROM public.colaboradores WHERE status='ativo') + (SELECT count(*) FROM public.terceiros WHERE ativo),
    'admissoes', (SELECT count(*) FROM public.eventos_jml WHERE tipo='joiner' AND created_at >= now() - make_interval(days => (SELECT n FROM d))),
    'desligamentos', (SELECT count(*) FROM public.eventos_jml WHERE tipo='leaver' AND created_at >= now() - make_interval(days => (SELECT n FROM d))),
    'execucoes', (SELECT ok_cur FROM q), 'execucoes_prev', (SELECT ok_prev FROM q),
    'falhas_24h', (SELECT fail_24h FROM q), 'falhas_prev', (SELECT fail_prev FROM q),
    'aguardando', (SELECT aguardando FROM q),
    'quarentena', (SELECT count(*) FROM public.colab_quarentena WHERE status='pendente'),
    'revisoes_abertas', (SELECT count(*) FROM public.revisoes WHERE status='em_andamento'),
    'excecoes_vencendo', (SELECT count(*) FROM public.excecoes WHERE status='aprovada' AND validade BETWEEN current_date AND current_date + 7),
    'terceiros_vencidos', (SELECT count(*) FROM public.terceiros WHERE ativo AND contrato_fim < current_date),
    'licencas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', COALESCE(friendly_name, nome), 'total', total, 'em_uso', em_uso) ORDER BY em_uso DESC), '[]') FROM (SELECT * FROM public.entra_licencas WHERE total > 0 AND total < 100000 ORDER BY em_uso DESC LIMIT 6) l),
    'agente', (SELECT jsonb_build_object('last_seen_at', max(last_seen_at)) FROM public.iam_agent_status)
  )
$$;
REVOKE ALL ON FUNCTION public.dashboard_kpis(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_kpis(integer) TO authenticated, service_role;