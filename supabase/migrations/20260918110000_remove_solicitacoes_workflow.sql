-- =============================================================================
-- Remoção do módulo de Solicitações / Workflow / Portal de self-service
--
-- O canal de pedidos é o GLPI (Hermes → MCP request_access → fila → Aprovação);
-- acesso fora da regra com validade é Exceções. O módulo paralelo (pedidos com
-- workflow multi-etapa executado no navegador) sai por inteiro: 6 tabelas, a
-- função do catálogo do portal e o KPI do dashboard.
--
-- Papéis: sem o portal, `viewer` passa a ser "somente leitura no painel"
-- (políticas de SELECT) e `platform_admin` herda tudo de `admin` (has_role
-- hierárquico) — antes um platform_admin puro caía nas checagens de admin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Módulo de solicitações/workflow
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.workflow_execucoes CASCADE;
DROP TABLE IF EXISTS public.workflow_etapa_aprovadores CASCADE;
DROP TABLE IF EXISTS public.workflow_etapas CASCADE;
DROP TABLE IF EXISTS public.solicitacao_itens CASCADE;
DROP TABLE IF EXISTS public.solicitacoes_acesso CASCADE;
DROP TABLE IF EXISTS public.workflow_fluxos CASCADE;
DROP FUNCTION IF EXISTS public.licencas_catalogo();

-- alertas antigos que apontavam para a tela removida ficam no histórico, sem link
UPDATE public.alertas SET ref_url = NULL WHERE ref_url LIKE '/solicitacoes%' OR ref_url LIKE '/workflow%';

-- ---------------------------------------------------------------------------
-- 2. Papéis: hierarquia platform_admin ⊇ admin ⊇ operador; viewer só lê
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND (role = _role
            OR (_role = 'admin'    AND role = 'platform_admin')
            OR (_role = 'operador' AND role IN ('admin', 'platform_admin')))
  );
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT polrelid::regclass AS tbl
      FROM pg_policy
     WHERE polcmd = 'r'
       AND pg_get_expr(polqual, polrelid) ILIKE '%operador%'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = r.tbl AND polname = 'Viewers can select') THEN
      EXECUTE format('CREATE POLICY "Viewers can select" ON %s FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''viewer''))', r.tbl);
    END IF;
  END LOOP;
END $$;
-- profiles: viewer precisa resolver nomes de operadores/aprovadores nas telas
DROP POLICY IF EXISTS "Viewers can select" ON public.profiles;
CREATE POLICY "Viewers can select" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

-- ---------------------------------------------------------------------------
-- 3. dashboard_metrics sem o KPI de solicitações
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := '{}'::jsonb;
  v_sod int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege'; END IF;

  SELECT v || jsonb_build_object(
    'colab_ativos',     count(*) FILTER (WHERE status = 'ativo'),
    'colab_ferias',     count(*) FILTER (WHERE status = 'ferias'),
    'colab_afastados',  count(*) FILTER (WHERE status = 'afastado'),
    'colab_inativos',   count(*) FILTER (WHERE status = 'inativo'),
    'colab_desligados', count(*) FILTER (WHERE status = 'desligado'),
    'colab_total',      count(*),
    'colab_sem_entra',  count(*) FILTER (WHERE status = 'ativo' AND entra_id IS NULL),
    'colab_sem_cargo',  count(*) FILTER (WHERE status = 'ativo' AND cargo_id IS NULL),
    'colab_suspensos',  count(*) FILTER (WHERE suspenso_preventivo),
    'joiners_30d',      (SELECT count(*) FROM colaboradores c2 WHERE c2.created_at >= now() - interval '30 days'),
    'leavers_30d',      (SELECT count(*) FROM eventos_jml e WHERE e.tipo = 'leaver' AND e.created_at >= now() - interval '30 days'))
  INTO v FROM colaboradores;

  SELECT v || jsonb_build_object(
    'terc_ativos',      count(*) FILTER (WHERE ativo),
    'terc_inativos',    count(*) FILTER (WHERE NOT ativo),
    'terc_vencendo_30d', count(*) FILTER (WHERE ativo AND contrato_fim IS NOT NULL AND contrato_fim BETWEEN current_date AND current_date + 30),
    'terc_vencidos',    count(*) FILTER (WHERE ativo AND contrato_fim IS NOT NULL AND contrato_fim < current_date),
    'terc_revalidar',   count(*) FILTER (WHERE ativo AND COALESCE(ultima_revalidacao, contrato_inicio, created_at::date) < current_date - COALESCE(public.iam_param('terceiro_revalidacao_dias','45')::int, 45)))
  INTO v FROM terceiros;

  SELECT v || jsonb_build_object(
    'fila_pending',     count(*) FILTER (WHERE status = 'pending'),
    'fila_waiting',     count(*) FILTER (WHERE status = 'waiting_approval'),
    'fila_processing',  count(*) FILTER (WHERE status = 'processing'),
    'fila_failed',      count(*) FILTER (WHERE status = 'failed'),
    'fila_success_24h', count(*) FILTER (WHERE status = 'success' AND processed_at >= now() - interval '24 hours'),
    'fila_success_7d',  count(*) FILTER (WHERE status = 'success' AND processed_at >= now() - interval '7 days'),
    'fila_oldest_waiting', min(created_at) FILTER (WHERE status = 'waiting_approval'),
    'fila_oldest_pending', min(created_at) FILTER (WHERE status = 'pending'),
    'fila_tempo_medio_min', (SELECT round(avg(extract(epoch FROM (processed_at - COALESCE(approved_at, created_at))) / 60)::numeric, 1)
                               FROM iam_queue q2 WHERE q2.status = 'success' AND q2.processed_at >= now() - interval '7 days' AND q2.processed_at > COALESCE(q2.approved_at, q2.created_at)),
    'fila_orfaos',      count(*) FILTER (WHERE action_type = 'review_orphan_entra' AND status = 'waiting_approval'))
  INTO v FROM iam_queue;

  SELECT v || jsonb_build_object('fila_falhas_por_codigo', COALESCE(jsonb_agg(jsonb_build_object('codigo', codigo, 'total', total) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT COALESCE(error_code, 'sem_codigo') AS codigo, count(*) AS total FROM iam_queue
           WHERE status = 'failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 6) f;

  SELECT v || jsonb_build_object('fila_por_acao_7d', COALESCE(jsonb_agg(jsonb_build_object('acao', action_type, 'total', total, 'sucesso', ok, 'falha', ko) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT action_type, count(*) AS total, count(*) FILTER (WHERE status = 'success') AS ok, count(*) FILTER (WHERE status = 'failed') AS ko
            FROM iam_queue WHERE created_at >= now() - interval '7 days' AND status <> 'cancelled' GROUP BY 1 ORDER BY 2 DESC LIMIT 10) a;

  SELECT v || jsonb_build_object(
    'excecoes_pendentes',(SELECT count(*) FROM excecoes WHERE status = 'pendente'),
    'excecoes_vencendo', (SELECT count(*) FROM excecoes WHERE status = 'aprovada' AND validade IS NOT NULL AND validade BETWEEN current_date AND current_date + 15),
    'excecoes_ativas',   (SELECT count(*) FROM excecoes WHERE status = 'aprovada' AND (validade IS NULL OR validade >= current_date)),
    'revisoes_abertas',  (SELECT count(*) FROM revisoes WHERE status = 'em_andamento'),
    'revisoes_itens_pendentes', (SELECT count(*) FROM revisao_itens ri JOIN revisoes r ON r.id = ri.revisao_id WHERE r.status = 'em_andamento' AND ri.decisao IS NULL),
    'revisoes_atrasadas',(SELECT count(*) FROM revisoes WHERE status = 'em_andamento' AND data_fim IS NOT NULL AND data_fim < current_date),
    'alertas_nao_lidos', (SELECT count(*) FROM alertas WHERE NOT lido),
    'alertas_criticos',  (SELECT count(*) FROM alertas WHERE NOT lido AND severidade::text = 'critico'),
    'perfis_ativos',     (SELECT count(*) FROM perfis_acesso WHERE ativo),
    'apps_total',        (SELECT count(*) FROM aplicacoes),
    'apps_sem_owner',    (SELECT count(*) FROM aplicacoes WHERE owner IS NULL OR owner = ''),
    'quarentena',        (SELECT count(*) FROM colab_quarentena WHERE status = 'pendente'),
    'priv_membros',      (SELECT count(DISTINCT user_entra_id) FROM entra_role_members),
    'priv_roles',        (SELECT count(*) FROM entra_roles WHERE is_privileged))
  INTO v;

  SELECT count(*) INTO v_sod
    FROM sod_conflitos s
    JOIN perfil_atribuicoes a ON a.perfil_id = s.perfil_a_id AND a.ativo
    JOIN perfil_atribuicoes b ON b.perfil_id = s.perfil_b_id AND b.ativo
     AND ((a.colaborador_id IS NOT NULL AND a.colaborador_id = b.colaborador_id) OR (a.terceiro_id IS NOT NULL AND a.terceiro_id = b.terceiro_id))
   WHERE s.ativo;
  v := v || jsonb_build_object('sod_violacoes', v_sod);

  SELECT v || jsonb_build_object(
    'licencas_criticas', count(*) FILTER (WHERE total > 0 AND NOT COALESCE(is_trial,false) AND em_uso::numeric / total * 100 >= COALESCE(public.iam_param('licenca_critico_pct','90')::numeric, 90)),
    'licencas_total_seats', COALESCE(sum(total) FILTER (WHERE NOT COALESCE(is_trial,false)), 0),
    'licencas_em_uso',   COALESCE(sum(em_uso) FILTER (WHERE NOT COALESCE(is_trial,false)), 0))
  INTO v FROM entra_licencas;

  SELECT v || jsonb_build_object('agente', COALESCE((SELECT jsonb_agg(jsonb_build_object('owner', owner, 'last_seen_at', last_seen_at, 'last_claim_at', last_claim_at,
                                                          'last_result_at', last_result_at, 'last_result', last_result, 'version', version, 'host', host, 'execute_mode', execute_mode) ORDER BY last_seen_at DESC)
                                             FROM iam_agent_status), '[]'::jsonb),
                                 'ultimo_ciclo', (SELECT jsonb_build_object('status', status, 'phase', phase, 'message', message, 'updated_at', updated_at, 'created_at', created_at)
                                                    FROM sync_jobs WHERE tipo = 'daily_cycle' ORDER BY created_at DESC LIMIT 1),
                                 'ultimo_csv',   (SELECT jsonb_build_object('status', status, 'message', message, 'updated_at', updated_at, 'created_at', created_at, 'filename', filename,
                                                                            'colab_created', colab_created, 'colab_updated', colab_updated, 'colab_inativos', colab_inativos)
                                                    FROM sync_jobs WHERE tipo = 'csv_colab' ORDER BY created_at DESC LIMIT 1),
                                 'ultima_reconciliacao', (SELECT jsonb_build_object('status', status, 'message', message, 'updated_at', updated_at, 'created_at', created_at)
                                                    FROM sync_jobs WHERE tipo = 'reconcile_identities' ORDER BY created_at DESC LIMIT 1),
                                 'gerado_em', now())
  INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics() TO authenticated;
