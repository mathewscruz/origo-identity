-- Read-only projection of already-audited RH work. No queue rows or execution.
CREATE OR REPLACE FUNCTION public.rh_dashboard_events()
RETURNS TABLE(id text, correlation_id text, pessoa_id text, pessoa text, ts timestamptz, kind text, status text, ad_ts timestamptz, ad_verified boolean, evidence jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
WITH source AS (
 SELECT a.*,COALESCE(NULLIF(a.detalhes->>'correlation_id',''),a.id::text) corr,
 CASE WHEN a.acao='rh_cadastral_incremental' THEN 'cadastro'
 WHEN a.acao IN ('rh_desligamento_escopo14','rh_desligamento_cloud_verificado') THEN 'offboarding'
 ELSE a.detalhes->>'operation' END op
 FROM public.auditoria a
 WHERE a.entidade IN ('colaboradores','colaborador')
 AND a.entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND a.acao IN ('rh_cadastral_incremental','rh_desligamento_escopo14','rh_desligamento_cloud_verificado','rh_operation_verified')
), latest AS (
 SELECT DISTINCT ON(corr,entidade_id,op) * FROM source WHERE op IN ('cadastro','offboarding','onboarding') ORDER BY corr,entidade_id,op,timestamp DESC,id DESC
), ad AS (
 SELECT corr,entidade_id,min(timestamp) ad_ts FROM source
 WHERE detalhes->>'ad_disabled_verified'='true' AND detalhes->>'iam_status'='desligado'
 GROUP BY corr,entidade_id
)
SELECT a.id::text,a.corr,a.entidade_id,COALESCE(a.detalhes->>'pessoa',a.detalhes->>'nome',snap.pessoa,c.nome,'Pessoa '||a.entidade_id),a.timestamp,a.op,
 CASE
 WHEN a.acao='rh_cadastral_incremental' AND a.detalhes->>'external_actions'='0' THEN 'success'
 WHEN a.acao='rh_operation_verified' AND a.detalhes->>'status'='failed' THEN 'failed'
 WHEN a.acao='rh_operation_verified' AND a.detalhes->>'status'='pending' THEN 'pending'
 WHEN a.acao='rh_operation_verified' AND a.detalhes->>'status'='success' AND a.detalhes->>'readback_verified'='true' AND a.detalhes->'pending'='[]'::jsonb AND a.detalhes->>'gates_complete'='true' THEN 'success'
 WHEN a.acao='rh_desligamento_cloud_verificado' AND ad.ad_ts IS NOT NULL
 AND a.detalhes->>'cloud_status'='verified' AND a.detalhes->>'accountEnabled'='false'
 AND a.detalhes->>'remaining_assigned_licenses'='0' AND a.detalhes->>'remaining_apps'='0' THEN 'success'
 ELSE 'partial' END,
 ad.ad_ts,ad.ad_ts IS NOT NULL,
 jsonb_build_object('audit_id',a.id,'source',a.detalhes->'source','ad_disabled_verified',ad.ad_ts IS NOT NULL,
 'cloud_status',a.detalhes->>'cloud_status','accountEnabled',a.detalhes->'accountEnabled',
 'remaining_assigned_licenses',a.detalhes->'remaining_assigned_licenses','remaining_apps',a.detalhes->'remaining_apps',
 'remaining_groups_informative',a.detalhes->'remaining_groups','pending',a.detalhes->'pending',
 'pending_counts',a.detalhes->'pending_counts','summary',a.detalhes->>'summary','observed_at',a.detalhes->>'observed_at',
 'source_audit_id',a.detalhes->>'source_audit_id','evidence_sha256',a.detalhes->>'evidence_sha256','iam_status',a.detalhes->>'iam_status')
FROM latest a LEFT JOIN ad ON ad.corr=a.corr AND ad.entidade_id=a.entidade_id LEFT JOIN public.colaboradores c ON c.id::text=a.entidade_id LEFT JOIN public.rh_audit_person_snapshots snap ON snap.audit_id::text=a.id::text;
$fn$;
REVOKE ALL ON FUNCTION public.rh_dashboard_events() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rh_dashboard_events() TO authenticated,service_role;


NOTIFY pgrst,'reload schema';
