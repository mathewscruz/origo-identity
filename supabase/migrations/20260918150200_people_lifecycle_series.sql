-- Additive projection: no changes to the legacy feed, series, identities or queue.
-- Count distinct stable people per day/direction. A new lifecycle on another day
-- can count again; resource actions and JML registration NEVER prove a lifecycle.
CREATE OR REPLACE FUNCTION public.dashboard_people_series(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
WITH days AS (
 SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date-n)::date dia
 FROM generate_series(LEAST(GREATEST(COALESCE(p_days,30),1),366)-1,0,-1)n
), rh AS (
 SELECT r.*, a.detalhes FROM public.rh_dashboard_events() r
 JOIN public.auditoria a ON a.id::text=r.id
 WHERE r.kind IN ('onboarding','offboarding')
), queue_creation AS (
 -- Closed allowlist: success alone includes already_exists/reconciliation.
 SELECT q.id::text id, COALESCE(q.correlation_id::text,q.id::text) corr,
 CASE WHEN q.colaborador_id IS NOT NULL THEN 'colaborador:'||q.colaborador_id::text
 ELSE 'terceiro:'||q.terceiro_id::text END person, q.processed_at ts, 'onboarding'::text kind
 FROM public.iam_queue q
 WHERE q.status='success' AND q.processed_at IS NOT NULL
 AND (q.colaborador_id IS NOT NULL OR q.terceiro_id IS NOT NULL)
 AND q.action_type IN ('create','create_if_not_exists')
 AND q.requested_by IS DISTINCT FROM 'entra_sync'
 AND q.result_message IN (
 'Conta AD parcialmente criada foi recuperada: senha definida e usuário habilitado via LDAPS.',
 'Conta criada e habilitada no AD 10.224.0.4; senha inicial definida; troca obrigatória no primeiro acesso; read-back confirmado. Falha original preservada.',
 'Usuário AD criado, senha inicial definida e conta habilitada via LDAP.',
 'Usuário AD criado, senha inicial definida e conta habilitada via PowerShell admin após delegação ACL.',
 'Usuário AD criado e habilitado via LDAPS; senha inicial definida e troca obrigatória validada. Replicação Entra e provisionamento concluídos em ações correlatas posteriores.',
 'Usuário AD criado, senha inicial definida, conta habilitada e validada via PowerShell administrativo transitório.')
), third_party_creation AS (
 SELECT a.id::text id,COALESCE(NULLIF(a.detalhes->>'correlation_id',''),a.id::text) corr,
 'terceiro:'||a.entidade_id person,a.timestamp ts,'onboarding'::text kind
 FROM public.auditoria a
 WHERE a.entidade='terceiros' AND a.entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND a.acao IN ('criar_terceiro_glpi','criar_terceiro_glpi_lote') AND a.detalhes->>'ad_action'='created'
), candidates AS (
 -- Only fully gated canonical RH readback counts as a completed exit.
 -- AD/IAM blocked with cloud pending remains in the feed, never in this chart.
 SELECT r.id,r.correlation_id corr,'colaborador:'||r.pessoa_id person,r.ts,r.kind
 FROM rh r WHERE r.status='success' AND r.detalhes->>'status'='success'
 AND r.detalhes->>'readback_verified'='true' AND r.detalhes->>'gates_complete'='true'
 AND r.detalhes->'pending'='[]'::jsonb
 UNION ALL
 SELECT q.* FROM queue_creation q WHERE NOT EXISTS (
 SELECT 1 FROM rh r WHERE q.person='colaborador:'||r.pessoa_id AND q.corr=r.correlation_id AND q.kind=r.kind)
 UNION ALL SELECT * FROM third_party_creation
), lifecycle AS (
 -- Correlation collapses RH/queue/retries even when observation days differ.
 SELECT DISTINCT ON(person,kind,corr) * FROM candidates ORDER BY person,kind,corr,ts DESC,id DESC
), daily AS (
 SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date dia,
 count(DISTINCT person) FILTER(WHERE kind='onboarding') entradas,
 count(DISTINCT person) FILTER(WHERE kind='offboarding') saidas
 FROM lifecycle GROUP BY 1
)
SELECT jsonb_agg(jsonb_build_object('dia',d.dia,'entradas',COALESCE(x.entradas,0),'saidas',COALESCE(x.saidas,0)) ORDER BY d.dia)
FROM days d LEFT JOIN daily x USING(dia);
$fn$;
REVOKE ALL ON FUNCTION public.dashboard_people_series(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dashboard_people_series(integer) TO authenticated,service_role;
COMMENT ON FUNCTION public.dashboard_people_series(integer) IS 'Distinct people/day/direction; confirmed creation, fully gated canonical offboarding. Not access actions, JML registrations, or partial AD-only exits. America/Sao_Paulo.';
NOTIFY pgrst,'reload schema';
