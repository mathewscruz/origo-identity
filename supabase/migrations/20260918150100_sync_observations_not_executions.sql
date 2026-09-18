CREATE OR REPLACE FUNCTION public.iam_queue_observation_kind(p_requested_by text,p_action_type text,p_status text,p_processed_by text,p_result_message text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $function$
 SELECT CASE WHEN p_requested_by='entra_sync' AND p_status='success' AND NULLIF(p_processed_by,'') IS NULL THEN
  CASE WHEN p_action_type IN ('assign_group','assign_license','assign_app') AND p_result_message IN (
   'Importado do Entra ID (já existente)',
   'Importado do Entra ID (licença ativa confirmada no Graph).',
   'Importado do Entra ID (grupo faltante no catálogo).') THEN 'access_observed'
  WHEN p_action_type IN ('remove_group','remove_license','remove_app') AND p_result_message IN (
   'Correção de sync: recurso não está mais presente no Entra ID',
   'Correção de sync: recurso não está mais presente no Entra após ação Graph.',
   'Correção de sync: grupo é transitivo/herdado, não associação direta gerenciável no usuário.') THEN 'access_absence_observed'
  ELSE NULL END ELSE NULL END;
$function$;
REVOKE ALL ON FUNCTION public.iam_queue_observation_kind(text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_observation_kind(text,text,text,text,text) TO authenticated,service_role;
COMMENT ON FUNCTION public.iam_queue_observation_kind(text,text,text,text,text) IS 'Inventory provenance classifier v1. Observed is not executed; raw legacy success remains inventory-compatible. Exact proven source/actions/messages only; NULL means not proven observation. No timestamp inference.';

CREATE OR REPLACE FUNCTION public.dashboard_activity(p_limit integer DEFAULT 40, p_categoria text DEFAULT NULL::text, p_colaborador_id uuid DEFAULT NULL::uuid, p_terceiro_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH rh_all AS MATERIALIZED (SELECT * FROM public.rh_dashboard_events()), lim AS (SELECT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200) AS n),
  pid AS (SELECT COALESCE(p_colaborador_id, p_terceiro_id)::text AS id),
  fila AS (
    SELECT 'fila'::text AS fonte, q.id::text AS id,
           GREATEST(q.created_at, COALESCE(q.processed_at, q.created_at), COALESCE(q.approved_at, q.created_at)) AS ts,
           'acesso'::text AS categoria,
           q.action_type AS acao,
           COALESCE(c.nome, t.nome, q.payload_json->>'displayName', q.target_identity, '—') AS pessoa,
           CASE WHEN c.id IS NOT NULL THEN 'colaborador' WHEN t.id IS NOT NULL THEN 'terceiro' ELSE NULL END AS pessoa_tipo,
           COALESCE(q.payload_json->>'groupName', q.payload_json->>'licenseName', q.payload_json->>'appName', q.payload_json->>'siteName',
                    NULLIF(q.payload_json->>'siteUrl', ''), NULL) AS recurso,
           q.status::text AS status,
           COALESCE(q.processed_by, pa.email, q.requested_by, 'sistema') AS ator,
           q.requested_by AS origem,
           left(COALESCE(q.result_message, q.rejection_reason, q.payload_json->>'motivo', ''), 160) AS detalhe,
           '/fila-provisionamento/' || q.id AS link
      FROM public.iam_queue q
      LEFT JOIN public.colaboradores c ON c.id = q.colaborador_id
      LEFT JOIN public.terceiros t ON t.id = q.terceiro_id
      LEFT JOIN public.profiles pa ON pa.id = q.approved_by
     WHERE public.iam_queue_observation_kind(q.requested_by,q.action_type,q.status::text,q.processed_by,q.result_message) IS NULL AND (p_categoria IS NULL OR p_categoria = 'acesso') AND (q.status::text <> 'cancelled' OR q.processed_at >= now() - interval '1 day')
       AND (p_colaborador_id IS NULL OR q.colaborador_id = p_colaborador_id)
       AND (p_terceiro_id IS NULL OR q.terceiro_id = p_terceiro_id)
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  jml AS (
    SELECT 'jml'::text, e.id::text, COALESCE(e.updated_at, e.created_at), 'pessoa'::text,
           'jml_' || e.tipo::text, COALESCE(e.colaborador_nome, '—'),
           CASE WHEN e.terceiro_id IS NOT NULL THEN 'terceiro' ELSE 'colaborador' END,
           NULL::text, e.status::text, COALESCE(e.origem, 'sistema'), e.origem,
           left(COALESCE(e.erro_mensagem, ''), 160), '/eventos-jml/' || e.id
      FROM public.eventos_jml e
     WHERE (p_categoria IS NULL OR p_categoria = 'pessoa') AND (p_colaborador_id IS NULL OR e.colaborador_id = p_colaborador_id)
       AND (p_terceiro_id IS NULL OR e.terceiro_id = p_terceiro_id)
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  rh AS (
    SELECT 'auditoria'::text fonte,r.id,r.ts,'pessoa'::text categoria,
      CASE r.kind WHEN 'offboarding' THEN 'rh_desligamento' WHEN 'onboarding' THEN 'rh_entrada' ELSE 'rh_cadastral_incremental' END acao,
      r.pessoa,'colaborador'::text pessoa_tipo,NULL::text recurso,r.status,'automacao_rh'::text ator,'rh'::text origem,
      CASE WHEN r.evidence->>'summary' IS NOT NULL THEN r.evidence->>'summary' WHEN r.kind='cadastro' THEN 'Cadastro RH atualizado; sem criação, exclusão ou ação de acesso'
      WHEN r.kind='offboarding' THEN CASE WHEN r.status='success' THEN 'AD/IAM e bloqueio Entra verificados; licenças/apps zerados; grupos residuais informativos' ELSE 'Desligamento parcial; AD/IAM: '||CASE WHEN r.ad_verified THEN 'bloqueio verificado' ELSE 'não comprovado' END||'; Entra/licenças/apps: pendências ou verificação incompleta' END
      ELSE 'Entrada RH: '||r.status END detalhe, '/colaboradores/'||r.pessoa_id link
    FROM rh_all r
    WHERE (p_categoria IS NULL OR p_categoria IN ('rh','pessoa')) AND (p_colaborador_id IS NULL OR r.pessoa_id=p_colaborador_id::text) AND p_terceiro_id IS NULL
    ORDER BY r.ts DESC,r.id LIMIT (SELECT n FROM lim)
  ),
  aud AS (
    SELECT 'auditoria'::text, a.id::text, a."timestamp",
           CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador', 'terceiros', 'terceiro', 'pessoa', 'eventos_jml', 'evento_jml', 'colab_quarentena') THEN 'pessoa'
             WHEN a.entidade IN ('perfil_atribuicoes', 'iam_queue', 'excecoes', 'excecao', 'revisoes', 'revisao', 'sod_conflitos', 'entra_role_members', 'contas_admin_conhecidas') THEN 'acesso'
             WHEN a.entidade IN ('aplicacoes', 'perfis_acesso', 'cargos', 'areas', 'empresas', 'localidades', 'licencas', 'regra', 'sharepoint_sites') THEN 'catalogo'
             ELSE 'sistema' END,
           a.acao,
           a.detalhes->>'pessoa' AS pessoa,
           a.detalhes->>'pessoa_tipo',
           NULL::text, NULL::text, COALESCE(a.operador, 'sistema'), a.entidade,
           left(COALESCE(a.resumo, ''), 200),
           CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/colaboradores/' || a.entidade_id
             WHEN a.entidade IN ('terceiros', 'terceiro') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/terceiros/' || a.entidade_id
             WHEN a.entidade = 'perfil_atribuicoes' AND a.detalhes->>'pessoa_tipo' = 'colaboradores' THEN '/colaboradores/' || (a.detalhes->>'pessoa_id')
             WHEN a.entidade = 'perfil_atribuicoes' AND a.detalhes->>'pessoa_tipo' = 'terceiros' THEN '/terceiros/' || (a.detalhes->>'pessoa_id')
             WHEN a.entidade IN ('revisoes', 'revisao') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/revisoes/' || a.entidade_id
             WHEN a.entidade IN ('excecoes', 'excecao') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/excecoes/' || a.entidade_id
             WHEN a.entidade = 'iam_queue' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/fila-provisionamento/' || a.entidade_id
             WHEN a.entidade IN ('eventos_jml', 'evento_jml') AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/eventos-jml/' || a.entidade_id
             WHEN a.entidade = 'aplicacoes' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/aplicacoes/' || a.entidade_id
             WHEN a.entidade = 'perfis_acesso' AND a.entidade_id ~ '^[0-9a-f-]{36}$' THEN '/perfis-acesso/' || a.entidade_id
             WHEN a.entidade = 'cargos' THEN '/configuracoes/cargos'
             WHEN a.entidade = 'areas' THEN '/configuracoes/areas'
             WHEN a.entidade = 'empresas' THEN '/configuracoes/empresas'
             WHEN a.entidade = 'localidades' THEN '/configuracoes/localidades'
             WHEN a.entidade = 'licencas' THEN '/licencas'
             WHEN a.entidade = 'parametros' THEN '/configuracoes/parametros'
             WHEN a.entidade IN ('colab_quarentena', 'sync_jobs', 'integracoes') THEN '/configuracoes/integracoes'
             WHEN a.entidade IN ('profiles', 'user_roles', 'usuarios') THEN '/admin/usuarios'
             ELSE '/auditoria' END
      FROM public.auditoria a
     WHERE (p_categoria IS NULL OR (CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador', 'terceiros', 'terceiro', 'pessoa', 'eventos_jml', 'evento_jml', 'colab_quarentena') THEN 'pessoa'
             WHEN a.entidade IN ('perfil_atribuicoes', 'iam_queue', 'excecoes', 'excecao', 'revisoes', 'revisao', 'sod_conflitos', 'entra_role_members', 'contas_admin_conhecidas') THEN 'acesso'
             WHEN a.entidade IN ('aplicacoes', 'perfis_acesso', 'cargos', 'areas', 'empresas', 'localidades', 'licencas', 'regra', 'sharepoint_sites') THEN 'catalogo'
             ELSE 'sistema' END) = p_categoria) AND a.acao NOT IN ('email_revisao', 'enviar_email', 'cron_invoke', 'admin_exec_sql', 'admin_exec_ddl')
       AND NOT (a.acao IN ('rh_reconciliation_processed','rh_desligamento_lote_parcial') AND EXISTS(SELECT 1 FROM rh_all rr WHERE rr.correlation_id=a.detalhes->>'correlation_id' OR rr.evidence->>'source_audit_id'=a.id::text))
       AND NOT (a.acao IN ('rh_cadastral_incremental','rh_desligamento_escopo14','rh_desligamento_cloud_verificado','rh_operation_verified') AND a.entidade IN ('colaboradores','colaborador'))
       AND ((SELECT id FROM pid) IS NULL
            OR a.entidade_id = (SELECT id FROM pid)
            OR a.detalhes->>'pessoa_id' = (SELECT id FROM pid)
            OR a.detalhes->>'colaborador_id' = (SELECT id FROM pid)
            OR a.detalhes->>'terceiro_id' = (SELECT id FROM pid))
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  todos AS (
    SELECT * FROM fila UNION ALL SELECT * FROM jml UNION ALL SELECT * FROM aud UNION ALL SELECT * FROM rh
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fonte', fonte, 'id', id, 'ts', ts, 'categoria', categoria, 'acao', acao, 'pessoa', pessoa, 'pessoa_tipo', pessoa_tipo,
           'recurso', recurso, 'status', status, 'ator', ator, 'origem', origem, 'detalhe', detalhe, 'link', link,
           'correlation_id',(SELECT r.correlation_id FROM rh_all r WHERE r.id=x.id LIMIT 1),
           'pessoa_id',(SELECT r.pessoa_id FROM rh_all r WHERE r.id=x.id LIMIT 1),
           'evidence',CASE WHEN origem='rh' THEN (SELECT r.evidence FROM rh_all r WHERE r.id=x.id LIMIT 1) ELSE NULL END)
           ORDER BY ts DESC), '[]'::jsonb)
    FROM (SELECT * FROM todos WHERE p_categoria IS NULL OR categoria = p_categoria OR (p_categoria='rh' AND origem='rh') ORDER BY ts DESC LIMIT (SELECT n FROM lim)) x;
$function$
;
CREATE OR REPLACE FUNCTION public.dashboard_series(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH dias AS (
 SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date-n)::date dia
 FROM generate_series(LEAST(GREATEST(COALESCE(p_days,30),1),366)-1,0,-1)n
), rh AS (SELECT * FROM public.rh_dashboard_events()),
queue_dedup AS (
 SELECT DISTINCT ON(COALESCE(NULLIF(q.correlation_id::text,''),q.id::text),COALESCE(q.colaborador_id::text,q.terceiro_id::text,q.target_identity,q.id::text),q.action_type,COALESCE(q.target_identity,'')||'|'||COALESCE(q.resource_key,q.payload_json->>'groupId',q.payload_json->>'licenseId',q.payload_json->>'appId',CASE WHEN q.action_type IN ('disable','disable_entra','enable_entra','create','create_if_not_exists','delete') THEN '' ELSE q.id::text END),q.status)
 q.* FROM public.iam_queue q WHERE q.status IN ('success','failed') AND q.processed_at IS NOT NULL AND public.iam_queue_observation_kind(q.requested_by,q.action_type,q.status::text,q.processed_by,q.result_message) IS NULL
 ORDER BY COALESCE(NULLIF(q.correlation_id::text,''),q.id::text),COALESCE(q.colaborador_id::text,q.terceiro_id::text,q.target_identity,q.id::text),q.action_type,COALESCE(q.target_identity,'')||'|'||COALESCE(q.resource_key,q.payload_json->>'groupId',q.payload_json->>'licenseId',q.payload_json->>'appId',CASE WHEN q.action_type IN ('disable','disable_entra','enable_entra','create','create_if_not_exists','delete') THEN '' ELSE q.id::text END),q.status,q.processed_at DESC,q.id DESC
), actions AS (
 SELECT q.processed_at ts,q.status::text status,
 CASE WHEN q.action_type LIKE 'assign\_%' OR q.action_type IN ('create','create_if_not_exists','enable_entra','create_user_app') THEN 'concessoes'
 WHEN q.action_type LIKE 'remove\_%' OR q.action_type IN ('disable','disable_entra','delete','disable_user_app','delete_user_app') THEN 'revogacoes' ELSE 'outros' END kind
 FROM queue_dedup q
 UNION ALL
 SELECT r.ad_ts,'success','revogacoes' FROM rh r WHERE r.ad_verified AND r.kind='offboarding'
 AND NOT EXISTS(SELECT 1 FROM queue_dedup q WHERE q.correlation_id::text=r.correlation_id AND q.colaborador_id::text=r.pessoa_id AND q.action_type='disable' AND q.status='success')
), daily AS (
 SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date dia,
 count(*) FILTER(WHERE status='success' AND kind='concessoes') concessoes,
 count(*) FILTER(WHERE status='success' AND kind='revogacoes') revogacoes,
 count(*) FILTER(WHERE status='success' AND kind='outros') outros,
 count(*) FILTER(WHERE status='failed') falhas FROM actions GROUP BY 1
), rh_daily AS (
 SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date dia,
 count(*) FILTER(WHERE kind='onboarding' AND status='success') rh_entradas,
 count(*) FILTER(WHERE kind='offboarding' AND status='success') rh_saidas,
 count(*) FILTER(WHERE kind IN ('onboarding','offboarding') AND status='partial') rh_parciais,
 count(*) FILTER(WHERE kind='cadastro' AND status='success') rh_cadastrais,
 count(*) FILTER(WHERE status='failed') rh_falhas,
 count(*) FILTER(WHERE status='pending') rh_pendentes FROM rh GROUP BY 1
), rh_ad AS (SELECT (ad_ts AT TIME ZONE 'America/Sao_Paulo')::date dia,count(*) n FROM rh WHERE ad_verified AND kind='offboarding' GROUP BY 1),
jml AS (
 -- Preserve historical registration series, explicitly not executed operations.
 SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date dia,
 count(DISTINCT COALESCE(colaborador_id::text,terceiro_id::text,colaborador_nome)) FILTER(WHERE tipo='joiner') joiners,
 count(DISTINCT COALESCE(colaborador_id::text,terceiro_id::text,colaborador_nome)) FILTER(WHERE tipo='mover') movers,
 count(DISTINCT COALESCE(colaborador_id::text,terceiro_id::text,colaborador_nome)) FILTER(WHERE tipo='leaver') leavers,
 count(*) FILTER(WHERE tipo='pre_leaver') pre_leavers FROM public.eventos_jml GROUP BY 1
)
SELECT jsonb_agg(jsonb_build_object('dia',d.dia,'concessoes',COALESCE(f.concessoes,0),'revogacoes',COALESCE(f.revogacoes,0),'outros',COALESCE(f.outros,0),'falhas',COALESCE(f.falhas,0),
'joiners',COALESCE(j.joiners,0),'movers',COALESCE(j.movers,0),'leavers',COALESCE(j.leavers,0),'pre_leavers',COALESCE(j.pre_leavers,0),
'rh_entradas',COALESCE(r.rh_entradas,0),'rh_saidas',COALESCE(r.rh_saidas,0),'rh_parciais',COALESCE(r.rh_parciais,0),'rh_cadastrais',COALESCE(r.rh_cadastrais,0),'rh_ad_bloqueios',COALESCE(a.n,0),'rh_falhas',COALESCE(r.rh_falhas,0),'rh_pendentes',COALESCE(r.rh_pendentes,0)) ORDER BY d.dia)
FROM dias d LEFT JOIN daily f USING(dia) LEFT JOIN jml j USING(dia) LEFT JOIN rh_daily r USING(dia) LEFT JOIN rh_ad a USING(dia);
$function$
;

REVOKE ALL ON FUNCTION public.dashboard_activity(integer,text,uuid,uuid),public.dashboard_series(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity(integer,text,uuid,uuid),public.dashboard_series(integer) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
