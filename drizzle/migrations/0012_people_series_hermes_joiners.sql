CREATE OR REPLACE FUNCTION public.dashboard_people_series(p_days integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
WITH days AS (
  SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date - n)::date dia
  FROM generate_series(LEAST(GREATEST(COALESCE(p_days,30),1),366)-1, 0, -1) n
), ev AS (
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
), hermes_joiner AS (
  -- Admissões confirmadas pelo Hermes (Telegram/GLPI) que criam a pessoa sem evento JML
  SELECT 'colaborador:'||a.entidade_id person, 'entrada'::text kind, a.timestamp ts
  FROM public.auditoria a
  WHERE a.entidade = 'colaboradores' AND a.entidade_id IS NOT NULL
    AND (a.acao = 'telegram_joiner_iam_created' OR a.acao ILIKE '%joiner%created%')
), allx AS (
  SELECT * FROM ev UNION ALL SELECT * FROM third_party_creation UNION ALL SELECT * FROM hermes_joiner
), daily AS (
  SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date dia,
         count(DISTINCT person) FILTER (WHERE kind = 'entrada') entradas,
         count(DISTINCT person) FILTER (WHERE kind = 'saida') saidas
  FROM allx GROUP BY 1
)
SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'entradas', COALESCE(x.entradas,0), 'saidas', COALESCE(x.saidas,0)) ORDER BY d.dia)
FROM days d LEFT JOIN daily x USING (dia);
$function$;