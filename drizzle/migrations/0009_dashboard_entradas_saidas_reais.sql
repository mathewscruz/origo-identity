CREATE OR REPLACE FUNCTION public.dashboard_people_series(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH days AS (
  SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - n)::date dia
  FROM generate_series(LEAST(GREATEST(COALESCE(p_days,30),1),366)-1, 0, -1) n
), ev AS (
  -- Entradas/saídas executadas (colaboradores e terceiros), datadas pela execução real na fila
  SELECT CASE WHEN e.colaborador_id IS NOT NULL THEN 'colaborador:'||e.colaborador_id ELSE 'terceiro:'||e.terceiro_id END person,
         CASE e.tipo WHEN 'joiner' THEN 'entrada' ELSE 'saida' END kind,
         COALESCE((
           SELECT min(q.processed_at) FROM public.iam_queue q
           WHERE q.status = 'success' AND q.processed_at IS NOT NULL
             AND q.processed_at >= e.created_at - interval '1 hour'
             AND ((e.colaborador_id IS NOT NULL AND q.colaborador_id = e.colaborador_id)
               OR (e.terceiro_id IS NOT NULL AND q.terceiro_id = e.terceiro_id))
             AND (CASE WHEN e.tipo = 'joiner'
                    THEN q.action_type IN ('create','create_if_not_exists','enable_account','enable_user')
                    ELSE q.action_type ILIKE '%disable%' END)
         ), e.updated_at) ts
  FROM public.eventos_jml e
  WHERE e.tipo IN ('joiner','leaver') AND e.status = 'executado'
    AND (e.colaborador_id IS NOT NULL OR e.terceiro_id IS NOT NULL)
    AND e.created_at >= now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days,30),1),366) + 7)
), third_party_creation AS (
  SELECT 'terceiro:'||a.entidade_id person, 'entrada'::text kind, a.timestamp ts
  FROM public.auditoria a
  WHERE a.entidade = 'terceiros'
    AND a.acao IN ('criar_terceiro_glpi','criar_terceiro_glpi_lote') AND a.detalhes->>'ad_action' = 'created'
), allx AS (
  SELECT * FROM ev UNION ALL SELECT * FROM third_party_creation
), daily AS (
  SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date dia,
         count(DISTINCT person) FILTER (WHERE kind = 'entrada') entradas,
         count(DISTINCT person) FILTER (WHERE kind = 'saida') saidas
  FROM allx GROUP BY 1
)
SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'entradas', COALESCE(x.entradas,0), 'saidas', COALESCE(x.saidas,0)) ORDER BY d.dia)
FROM days d LEFT JOIN daily x USING (dia);
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'admissoes', (SELECT count(*) FROM public.eventos_jml WHERE tipo='joiner' AND status='executado' AND updated_at >= now() - make_interval(days => (SELECT n FROM d))),
    'desligamentos', (SELECT count(*) FROM public.eventos_jml WHERE tipo='leaver' AND status='executado' AND updated_at >= now() - make_interval(days => (SELECT n FROM d))),
    'eventos_parados', (SELECT count(*) FROM public.eventos_jml WHERE tipo IN ('joiner','leaver') AND status='pendente' AND created_at < now() - interval '7 days'),
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
$function$;