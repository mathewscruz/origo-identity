-- =============================================================================
-- 2026-09-18 — Revalidação de terceiros por responsável + atividade recente
--
-- 1. Revalidação de terceiros vira uma campanha de revisão (tipo 'terceiros'):
--    o responsável (colaborador) recebe por e-mail um link externo onde decide,
--    terceiro a terceiro, "Manter" (revalida) ou "Desligar". Prazo configurável
--    (terceiro_revalidacao_prazo_dias); sem resposta até o prazo, os terceiros
--    da campanha são DESATIVADOS automaticamente (auto-recertification).
--    Periodicidade: terceiro_revalidacao_dias. Desligamentos entram na fila já
--    aprovados (decisão do responsável) e o Órigo Agente executa.
-- 2. Auditoria automática de perfil_atribuicoes (trigger) — toda atribuição /
--    revogação de perfil aparece na trilha e na atividade recente.
-- 3. dashboard_activity(): feed unificado (auditoria + fila + eventos JML) para
--    a "Atividade recente" do dashboard.
-- Tudo idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Parâmetros
-- ---------------------------------------------------------------------------
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('terceiro_revalidacao_prazo_dias', '7', 'Prazo (dias) para o responsável responder à revalidação de terceiros; sem resposta, os terceiros são desativados automaticamente')
ON CONFLICT (chave) DO UPDATE SET descricao = EXCLUDED.descricao;
UPDATE public.parametros
   SET descricao = 'Periodicidade (dias) da revalidação de terceiros: o responsável recebe um link para manter ou desligar cada terceiro'
 WHERE chave = 'terceiro_revalidacao_dias';
-- a notificação avulsa deixou de existir: a campanha é o registro
ALTER TABLE public.terceiros DROP COLUMN IF EXISTS revalidacao_notificada_em;

-- ---------------------------------------------------------------------------
-- 2. revisao_criar: + tipo 'terceiros' (responsável = colaborador ou texto)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.revisao_criar(text, uuid, uuid, date, text, text);
CREATE OR REPLACE FUNCTION public.revisao_criar(
  p_tipo text, p_aplicacao_id uuid DEFAULT NULL, p_gestor_id uuid DEFAULT NULL,
  p_data_fim date DEFAULT NULL, p_nome text DEFAULT NULL, p_operador text DEFAULT NULL,
  p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op      text;
  v_app     aplicacoes%ROWTYPE;
  v_gestor  colaboradores%ROWTYPE;
  v_nome    text;
  v_owner   text;
  v_email   text;
  v_fim     date := p_data_fim;
  v_id      uuid;
  v_exist   uuid;
  v_n       int := 0;
  v_perfis  uuid[];
  v_key     text;
  v_desc    text;
  r         record;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = auth.uid();
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF p_tipo NOT IN ('aplicacao', 'gestor', 'terceiros') THEN RETURN jsonb_build_object('ok', false, 'error', 'tipo deve ser aplicacao, gestor ou terceiros'); END IF;

  IF p_tipo = 'aplicacao' THEN
    SELECT * INTO v_app FROM public.aplicacoes WHERE id = p_aplicacao_id;
    IF v_app.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Aplicação não encontrada'); END IF;
    SELECT id INTO v_exist FROM public.revisoes WHERE aplicacao_id = v_app.id AND status = 'em_andamento' LIMIT 1;
    IF v_exist IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_exist, 'existente', true); END IF;
    v_nome  := COALESCE(NULLIF(trim(p_nome), ''), 'Revisão — ' || v_app.nome);
    v_owner := v_app.owner;
    v_email := public.iam_resolve_email(v_app.owner);
    v_desc  := 'Quem tem acesso a ' || v_app.nome || ' — manter ou revogar. Revogações são executadas automaticamente pelo agente.';
  ELSIF p_tipo = 'gestor' THEN
    SELECT * INTO v_gestor FROM public.colaboradores WHERE id = p_gestor_id;
    IF v_gestor.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Gestor não encontrado'); END IF;
    SELECT id INTO v_exist FROM public.revisoes WHERE tipo = 'gestor' AND gestor_id = v_gestor.id AND status = 'em_andamento' LIMIT 1;
    IF v_exist IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_exist, 'existente', true); END IF;
    v_nome  := COALESCE(NULLIF(trim(p_nome), ''), 'Revisão — equipe de ' || v_gestor.nome);
    v_owner := v_gestor.nome;
    v_email := lower(v_gestor.email);
    v_desc  := 'Acessos da equipe de ' || v_gestor.nome || ' — manter ou revogar. Revogações são executadas automaticamente pelo agente.';
  ELSE
    -- terceiros: responsável é um colaborador (p_gestor_id) ou um texto livre (p_responsavel)
    IF p_gestor_id IS NOT NULL THEN
      SELECT * INTO v_gestor FROM public.colaboradores WHERE id = p_gestor_id;
      IF v_gestor.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Responsável não encontrado'); END IF;
      SELECT id INTO v_exist FROM public.revisoes WHERE tipo = 'terceiros' AND gestor_id = v_gestor.id AND status = 'em_andamento' LIMIT 1;
      v_owner := v_gestor.nome;
      v_email := lower(v_gestor.email);
    ELSE
      IF NULLIF(trim(COALESCE(p_responsavel, '')), '') IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Informe o responsável (colaborador ou nome/e-mail)'); END IF;
      v_owner := trim(p_responsavel);
      SELECT id INTO v_exist FROM public.revisoes WHERE tipo = 'terceiros' AND gestor_id IS NULL AND status = 'em_andamento' AND lower(responsavel) = lower(v_owner) LIMIT 1;
      v_email := public.iam_resolve_email(v_owner);
    END IF;
    IF v_exist IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_exist, 'existente', true); END IF;
    v_nome := COALESCE(NULLIF(trim(p_nome), ''), 'Revalidação de terceiros — ' || v_owner);
    v_fim  := COALESCE(p_data_fim, current_date + COALESCE(NULLIF(public.iam_param('terceiro_revalidacao_prazo_dias', '7'), '')::int, 7));
    v_desc := 'Terceiros sob responsabilidade de ' || v_owner || ' — manter (revalida o acesso) ou desligar. Sem resposta até ' || to_char(v_fim, 'DD/MM/YYYY') || ' os terceiros são desativados automaticamente.';
  END IF;

  INSERT INTO public.revisoes (nome, descricao, status, responsavel, data_inicio, data_fim, total_itens, itens_revisados, token, aplicacao_id, gestor_id, owner_email, tipo, criada_por)
  VALUES (v_nome, v_desc, 'em_andamento', v_owner, current_date, v_fim, 0, 0, gen_random_uuid()::text, v_app.id, v_gestor.id, v_email, p_tipo, v_op)
  RETURNING id INTO v_id;

  IF p_tipo = 'aplicacao' THEN
    SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_perfis FROM public.perfil_aplicacoes WHERE aplicacao_id = v_app.id;
    INSERT INTO public.revisao_itens (revisao_id, tipo, colaborador_id, terceiro_id, colaborador_nome, perfil_id, perfil_nome, recurso_nome, origem, cargo_nome, area_nome)
    SELECT v_id, 'perfil', a.colaborador_id, a.terceiro_id, COALESCE(c.nome, t.nome, '—'), a.perfil_id, p.nome, p.nome, a.origem, cg.nome, ar.nome
      FROM public.perfil_atribuicoes a
      JOIN public.perfis_acesso p ON p.id = a.perfil_id
      LEFT JOIN public.colaboradores c ON c.id = a.colaborador_id
      LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
      LEFT JOIN public.areas ar ON ar.id = c.area_id
      LEFT JOIN public.terceiros t ON t.id = a.terceiro_id
     WHERE a.ativo AND a.perfil_id = ANY (v_perfis)
       AND (c.id IS NULL OR c.status::text <> 'desligado') AND (t.id IS NULL OR t.ativo);
    IF v_app.entra_id IS NOT NULL THEN
      v_key := 'app:' || v_app.entra_id;
      INSERT INTO public.revisao_itens (revisao_id, tipo, colaborador_id, terceiro_id, colaborador_nome, perfil_id, perfil_nome, recurso_nome, resource_key, origem, cargo_nome, area_nome)
      SELECT v_id, 'individual', u.colaborador_id, u.terceiro_id, COALESCE(c.nome, t.nome, u.target_identity, '—'), NULL, 'Acesso direto', v_app.nome, v_key, u.requested_by, cg.nome, ar.nome
        FROM (
          SELECT DISTINCT ON (q.colaborador_id, q.terceiro_id) q.*
            FROM public.iam_queue q
           WHERE q.status = 'success'
             AND (q.action_type LIKE 'assign\_%' OR q.action_type LIKE 'remove\_%')
             AND public.iam_queue_resource_key(q.action_type, q.payload_json, q.resource_key) = v_key
             AND (q.colaborador_id IS NOT NULL OR q.terceiro_id IS NOT NULL)
           ORDER BY q.colaborador_id, q.terceiro_id, COALESCE(q.processed_at, q.created_at) DESC
        ) u
        LEFT JOIN public.colaboradores c ON c.id = u.colaborador_id
        LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
        LEFT JOIN public.areas ar ON ar.id = c.area_id
        LEFT JOIN public.terceiros t ON t.id = u.terceiro_id
       WHERE u.action_type LIKE 'assign\_%' AND u.requested_by IN ('manual_individual', 'entra_sync')
         AND (c.id IS NULL OR c.status::text <> 'desligado') AND (t.id IS NULL OR t.ativo);
    END IF;
  ELSIF p_tipo = 'gestor' THEN
    INSERT INTO public.revisao_itens (revisao_id, tipo, colaborador_id, colaborador_nome, perfil_id, perfil_nome, recurso_nome, origem, cargo_nome, area_nome)
    SELECT v_id, 'perfil', a.colaborador_id, c.nome, a.perfil_id, p.nome, p.nome, a.origem, cg.nome, ar.nome
      FROM public.colaboradores c
      JOIN public.perfil_atribuicoes a ON a.colaborador_id = c.id AND a.ativo
      JOIN public.perfis_acesso p ON p.id = a.perfil_id
      LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
      LEFT JOIN public.areas ar ON ar.id = c.area_id
     WHERE c.gestor_id = v_gestor.id AND c.status::text IN ('ativo', 'ferias', 'afastado');
    FOR r IN SELECT c.id, c.nome, cg.nome AS cargo, ar.nome AS area FROM public.colaboradores c
               LEFT JOIN public.cargos cg ON cg.id = c.cargo_id LEFT JOIN public.areas ar ON ar.id = c.area_id
              WHERE c.gestor_id = v_gestor.id AND c.status::text IN ('ativo', 'ferias', 'afastado') LOOP
      INSERT INTO public.revisao_itens (revisao_id, tipo, colaborador_id, colaborador_nome, perfil_nome, recurso_nome, resource_key, origem, cargo_nome, area_nome)
      SELECT v_id, 'individual', r.id, r.nome, 'Acesso direto',
             COALESCE(i.payload->>'groupName', i.payload->>'licenseName', i.payload->>'appName', i.payload->>'siteName', i.resource_key),
             i.resource_key, i.requested_by, r.cargo, r.area
        FROM public.iam_individual_resources(r.id, NULL) i;
    END LOOP;
  ELSE
    -- um item por terceiro ativo do responsável; cargo_nome = empresa, area_nome = última revalidação
    INSERT INTO public.revisao_itens (revisao_id, tipo, terceiro_id, colaborador_nome, perfil_nome, recurso_nome, origem, cargo_nome, area_nome)
    SELECT v_id, 'terceiro', t.id, t.nome, 'Acesso de terceiro',
           format('%s perfil(is) · %s',
                  (SELECT count(*) FROM public.perfil_atribuicoes a WHERE a.terceiro_id = t.id AND a.ativo),
                  CASE WHEN t.contrato_fim IS NULL THEN 'contrato sem data de fim' ELSE 'contrato até ' || to_char(t.contrato_fim, 'DD/MM/YYYY') END),
           'terceiro', COALESCE(NULLIF(t.empresa_terceira, ''), 'Empresa não informada'),
           CASE WHEN t.ultima_revalidacao IS NULL THEN 'nunca revalidado' ELSE 'revalidado em ' || to_char(t.ultima_revalidacao, 'DD/MM/YYYY') END
      FROM public.terceiros t
     WHERE t.ativo
       AND ((v_gestor.id IS NOT NULL AND t.responsavel_colaborador_id = v_gestor.id)
         OR (v_gestor.id IS NULL AND t.responsavel_colaborador_id IS NULL AND lower(COALESCE(t.responsavel, '')) = lower(v_owner)))
     ORDER BY t.nome;
  END IF;

  SELECT total_itens INTO v_n FROM public.revisoes WHERE id = v_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('criar_revisao', 'revisoes', v_id::text, v_op,
          format('%s criada: %s (%s itens, responsável %s)', CASE WHEN p_tipo = 'terceiros' THEN 'Revalidação de terceiros' ELSE 'Campanha de revisão' END, v_nome, v_n, COALESCE(v_email, v_owner, '—')),
          jsonb_build_object('tipo', p_tipo, 'aplicacao_id', v_app.id, 'gestor_id', v_gestor.id, 'data_fim', v_fim));
  INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES (CASE WHEN p_tipo = 'terceiros' THEN 'Revalidação de terceiros: ' ELSE 'Revisão de acesso criada: ' END || v_nome,
          format('%s item(ns) para %s decidir%s.%s', v_n, COALESCE(v_email, v_owner, 'o responsável'),
                 CASE WHEN v_fim IS NOT NULL THEN ' até ' || to_char(v_fim, 'DD/MM/YYYY') ELSE '' END,
                 CASE WHEN p_tipo = 'terceiros' THEN ' Sem resposta, os terceiros são desativados.' ELSE '' END),
          'info', CASE WHEN p_tipo = 'terceiros' THEN 'revalidacao_terceiro' ELSE 'recertificacao' END, 'revisao', v_id::text, '/revisoes/' || v_id);
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'existente', false, 'total_itens', v_n, 'owner_email', v_email, 'sem_email', v_email IS NULL, 'data_fim', v_fim);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_criar(text, uuid, uuid, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_criar(text, uuid, uuid, date, text, text, text) TO authenticated, service_role;

-- uma campanha por responsável com terceiros a revalidar (ciclo periódico)
CREATE OR REPLACE FUNCTION public.revisao_criar_por_responsaveis(p_data_fim date DEFAULT NULL, p_operador text DEFAULT NULL, p_somente_vencidos boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record; v jsonb; v_per int; v_email text;
  v_criadas int := 0; v_existentes int := 0; v_sem_email int := 0; v_ids uuid[] := '{}'; v_sem_resp text[] := '{}';
BEGIN
  PERFORM public.iam_assert_operator();
  v_per := COALESCE(NULLIF(public.iam_param('terceiro_revalidacao_dias', '45'), '')::int, 45);
  FOR r IN
    SELECT t.responsavel_colaborador_id AS gestor_id, NULLIF(trim(COALESCE(t.responsavel, '')), '') AS responsavel, array_agg(t.nome ORDER BY t.nome) AS nomes
      FROM public.terceiros t
     WHERE t.ativo AND (t.contrato_fim IS NULL OR t.contrato_fim >= current_date)
       AND (NOT p_somente_vencidos OR COALESCE(t.ultima_revalidacao, t.contrato_inicio, t.created_at::date) + v_per <= current_date)
     GROUP BY 1, 2
  LOOP
    IF r.gestor_id IS NULL AND r.responsavel IS NULL THEN v_sem_resp := v_sem_resp || r.nomes; CONTINUE; END IF;
    -- sem e-mail do responsável a campanha não nasce: ninguém poderia responder e o prazo desligaria os terceiros
    IF r.gestor_id IS NOT NULL THEN
      SELECT lower(email) INTO v_email FROM public.colaboradores WHERE id = r.gestor_id AND status::text IN ('ativo', 'ferias', 'afastado') AND COALESCE(email, '') <> '';
    ELSE
      v_email := public.iam_resolve_email(r.responsavel);
    END IF;
    IF v_email IS NULL THEN v_sem_email := v_sem_email + 1; v_sem_resp := v_sem_resp || r.nomes; CONTINUE; END IF;
    v := public.revisao_criar('terceiros', NULL, r.gestor_id, p_data_fim, NULL, p_operador, r.responsavel);
    IF (v->>'ok')::boolean THEN
      IF (v->>'existente')::boolean THEN v_existentes := v_existentes + 1;
      ELSE v_criadas := v_criadas + 1; v_ids := array_append(v_ids, (v->>'id')::uuid); END IF;
    END IF;
  END LOOP;
  IF COALESCE(array_length(v_sem_resp, 1), 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.alertas WHERE tipo = 'terceiro_sem_responsavel' AND created_at >= now() - interval '7 days') THEN
    INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_url)
    VALUES ('Terceiros sem responsável com e-mail',
            format('Não foi possível abrir a revalidação de: %s. Defina em cada terceiro um responsável (colaborador ativo com e-mail).', array_to_string(v_sem_resp, ', ')),
            'aviso', 'terceiro_sem_responsavel', '/terceiros');
  END IF;
  RETURN jsonb_build_object('ok', true, 'criadas', v_criadas, 'existentes', v_existentes, 'sem_email', v_sem_email, 'sem_responsavel', to_jsonb(v_sem_resp), 'ids', to_jsonb(v_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_criar_por_responsaveis(date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_criar_por_responsaveis(date, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. revisao_concluir: + itens 'terceiro' (manter = revalida; revogar = desliga)
--    + p_sem_decisao ('manter' | 'revogar') para o prazo expirado
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.revisao_concluir(uuid, text);
CREATE OR REPLACE FUNCTION public.revisao_concluir(p_revisao_id uuid, p_decidido_por text DEFAULT NULL, p_sem_decisao text DEFAULT 'manter')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_por     text;
  v_rev     revisoes%ROWTYPE;
  v_item    record;
  v_res     record;
  v_id      jsonb;
  v_json    jsonb;
  v_dec     text;
  v_ativo   boolean;
  v_mant    int := 0; v_rev_n int := 0; v_pend int := 0; v_acoes int := 0; v_auto int := 0; v_n int;
  v_req     text := 'revisao:' || p_revisao_id::text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF COALESCE(p_sem_decisao, 'manter') NOT IN ('manter', 'revogar') THEN RETURN jsonb_build_object('ok', false, 'error', 'p_sem_decisao deve ser manter ou revogar'); END IF;
  SELECT COALESCE(p_decidido_por, email) INTO v_por FROM public.profiles WHERE id = auth.uid();
  v_por := COALESCE(v_por, p_decidido_por, 'revisor');
  SELECT * INTO v_rev FROM public.revisoes WHERE id = p_revisao_id FOR UPDATE;
  IF v_rev.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão não encontrada'); END IF;
  IF v_rev.status::text <> 'em_andamento' THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão já ' || v_rev.status::text); END IF;

  -- itens desta revisão nascem aprovados: quem decidiu foi o responsável pela recertificação
  PERFORM set_config('origo.pre_approved', jsonb_build_object('origem', 'revisao', 'ref', p_revisao_id, 'por', v_por, 'em', now())::text, true);
  PERFORM set_config('origo.operador', v_por, true);

  FOR v_item IN SELECT * FROM public.revisao_itens WHERE revisao_id = p_revisao_id ORDER BY colaborador_nome LOOP
    v_dec := v_item.decisao;
    IF v_dec IS NULL AND p_sem_decisao = 'revogar' THEN
      v_dec := 'revogar'; v_auto := v_auto + 1;
      UPDATE public.revisao_itens SET decisao = 'revogar', decidido_em = now(), decidido_por = 'sistema (prazo expirado)',
             justificativa = COALESCE(justificativa, 'Sem resposta do responsável até o prazo') WHERE id = v_item.id;
    END IF;
    IF v_dec IS NULL THEN v_pend := v_pend + 1; CONTINUE; END IF;

    IF v_dec = 'manter' THEN
      v_mant := v_mant + 1;
      IF v_item.tipo = 'terceiro' AND v_item.terceiro_id IS NOT NULL AND v_item.executado_em IS NULL THEN
        UPDATE public.terceiros SET ultima_revalidacao = current_date WHERE id = v_item.terceiro_id;
        UPDATE public.alertas SET lido = true WHERE tipo = 'revalidacao_terceiro' AND ref_id = v_item.terceiro_id::text AND NOT lido;
        INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
        VALUES ('revalidar_terceiro', 'terceiros', v_item.terceiro_id::text, v_por,
                format('Terceiro %s revalidado por %s na campanha "%s"', v_item.colaborador_nome, v_por, v_rev.nome),
                jsonb_build_object('revisao_id', p_revisao_id, 'justificativa', v_item.justificativa));
        UPDATE public.revisao_itens SET executado_em = now() WHERE id = v_item.id;
      END IF;
      CONTINUE;
    END IF;

    IF v_item.executado_em IS NOT NULL THEN v_rev_n := v_rev_n + 1; CONTINUE; END IF;
    v_rev_n := v_rev_n + 1;

    IF v_item.tipo = 'terceiro' AND v_item.terceiro_id IS NOT NULL THEN
      SELECT ativo INTO v_ativo FROM public.terceiros WHERE id = v_item.terceiro_id;
      IF COALESCE(v_ativo, false) THEN
        -- requested_by = revisao:<id> liga as ações da fila à campanha (painel "Execução pelo agente")
        v_json := public.terceiro_alterar_status(v_item.terceiro_id, false, v_req, 'revisao',
                    format('Não revalidado por %s na campanha "%s"%s', v_por, v_rev.nome, CASE WHEN NULLIF(v_item.justificativa, '') IS NOT NULL THEN ' — ' || v_item.justificativa ELSE '' END));
        v_acoes := v_acoes + COALESCE((v_json->>'remocoes')::int, 0) + 1;
      END IF;
    ELSIF v_item.tipo = 'perfil' AND v_item.perfil_id IS NOT NULL THEN
      UPDATE public.perfil_atribuicoes SET ativo = false, data_revogacao = now()
       WHERE perfil_id = v_item.perfil_id AND ativo
         AND ((v_item.colaborador_id IS NOT NULL AND colaborador_id = v_item.colaborador_id)
           OR (v_item.terceiro_id IS NOT NULL AND terceiro_id = v_item.terceiro_id));
      v_n := public.iam_enqueue_profile_actions(v_item.colaborador_id, v_item.terceiro_id, ARRAY[v_item.perfil_id], 'remove', v_req, 'pending', v_req);
      v_acoes := v_acoes + COALESCE(v_n, 0);
    ELSIF v_item.tipo = 'individual' AND v_item.resource_key IS NOT NULL THEN
      v_id := public.iam_identity(v_item.colaborador_id, v_item.terceiro_id);
      SELECT * INTO v_res FROM public.iam_individual_resources(v_item.colaborador_id, v_item.terceiro_id) WHERE resource_key = v_item.resource_key;
      IF v_id IS NOT NULL AND v_res.resource_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.iam_profile_resources(public.iam_active_perfil_ids(v_item.colaborador_id, v_item.terceiro_id)) pr WHERE pr.resource_key = v_item.resource_key) THEN
        IF public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, v_item.resource_key, v_req, 'pending', jsonb_build_object('reason', v_req)) THEN
          v_acoes := v_acoes + 1;
        END IF;
      END IF;
    END IF;
    UPDATE public.revisao_itens SET executado_em = now() WHERE id = v_item.id;
  END LOOP;
  PERFORM set_config('origo.pre_approved', '', true);
  PERFORM set_config('origo.operador', '', true);

  UPDATE public.revisoes
     SET status = 'concluida', concluida_em = now(), concluida_por = v_por,
         resultado = jsonb_build_object('mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes, 'automaticos', v_auto)
   WHERE id = p_revisao_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('concluir_revisao', 'revisoes', p_revisao_id::text, v_por,
          CASE WHEN v_rev.tipo = 'terceiros'
               THEN format('Revalidação "%s" concluída: %s mantidos, %s desligados (%s por prazo expirado), %s ação(ões) já aprovadas para o agente', v_rev.nome, v_mant, v_rev_n, v_auto, v_acoes)
               ELSE format('Revisão "%s" concluída: %s mantidos, %s revogados, %s pendentes, %s ação(ões) enfileirada(s) já aprovadas para o agente', v_rev.nome, v_mant, v_rev_n, v_pend, v_acoes) END,
          jsonb_build_object('mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes, 'automaticos', v_auto));
  INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES (CASE WHEN v_rev.tipo = 'terceiros' THEN 'Revalidação concluída: ' ELSE 'Revisão concluída: ' END || v_rev.nome,
          CASE WHEN v_rev.tipo = 'terceiros'
               THEN format('%s decidiu: %s mantidos, %s desligados%s. Contas e acessos dos desligados entram na fila já aprovados — o agente executa.', v_por, v_mant, v_rev_n, CASE WHEN v_auto > 0 THEN ' (' || v_auto || ' sem resposta no prazo)' ELSE '' END)
               ELSE format('%s decidiu: %s mantidos, %s revogados. %s remoção(ões) entraram na fila já aprovadas — o agente executa automaticamente.', v_por, v_mant, v_rev_n, v_acoes) END,
          (CASE WHEN v_rev_n > 0 THEN 'aviso' ELSE 'info' END)::severidade_alerta, 'revisao_concluida', 'revisao', p_revisao_id::text, '/revisoes/' || p_revisao_id);
  RETURN jsonb_build_object('ok', true, 'mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes, 'automaticos', v_auto, 'owner_email', v_rev.owner_email, 'nome', v_rev.nome, 'tipo', v_rev.tipo);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_concluir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_concluir(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Auditoria automática de atribuições de perfil
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_operador()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  v := NULLIF(current_setting('origo.operador', true), '');
  IF v IS NOT NULL THEN RETURN v; END IF;
  IF auth.uid() IS NOT NULL THEN SELECT email INTO v FROM public.profiles WHERE id = auth.uid(); END IF;
  RETURN COALESCE(v, 'sistema');
END;
$$;

CREATE OR REPLACE FUNCTION public.perfil_atribuicoes_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pessoa text; v_perfil text; v_tipo text; v_pid text;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.ativo IS NOT DISTINCT FROM NEW.ativo) THEN RETURN NULL; END IF;
  SELECT nome INTO v_perfil FROM public.perfis_acesso WHERE id = NEW.perfil_id;
  IF NEW.colaborador_id IS NOT NULL THEN
    SELECT nome INTO v_pessoa FROM public.colaboradores WHERE id = NEW.colaborador_id; v_tipo := 'colaboradores'; v_pid := NEW.colaborador_id::text;
  ELSE
    SELECT nome INTO v_pessoa FROM public.terceiros WHERE id = NEW.terceiro_id; v_tipo := 'terceiros'; v_pid := NEW.terceiro_id::text;
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES (CASE WHEN NEW.ativo THEN 'atribuir_perfil' ELSE 'revogar_perfil' END, 'perfil_atribuicoes', NEW.id::text, public.audit_operador(),
          CASE WHEN NEW.ativo THEN format('Perfil "%s" atribuído a %s (%s)', COALESCE(v_perfil, '?'), COALESCE(v_pessoa, '?'), COALESCE(NEW.origem, 'manual'))
               ELSE format('Perfil "%s" revogado de %s', COALESCE(v_perfil, '?'), COALESCE(v_pessoa, '?')) END,
          jsonb_build_object('perfil_id', NEW.perfil_id, 'perfil', v_perfil, 'pessoa_tipo', v_tipo, 'pessoa_id', v_pid, 'pessoa', v_pessoa, 'origem', NEW.origem, 'excecao_id', NEW.excecao_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perfil_atribuicoes_audit ON public.perfil_atribuicoes;
CREATE TRIGGER perfil_atribuicoes_audit
  AFTER INSERT OR UPDATE OF ativo ON public.perfil_atribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.perfil_atribuicoes_audit();

-- ---------------------------------------------------------------------------
-- 5. Atividade recente unificada (auditoria + fila + eventos JML)
--    categoria: pessoa | acesso | catalogo | sistema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_activity(p_limit integer DEFAULT 40, p_categoria text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200) AS n),
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
     WHERE q.status::text <> 'cancelled' OR q.processed_at >= now() - interval '1 day'
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  jml AS (
    SELECT 'jml'::text, e.id::text, COALESCE(e.updated_at, e.created_at), 'pessoa'::text,
           'jml_' || e.tipo::text, COALESCE(e.colaborador_nome, '—'),
           CASE WHEN e.terceiro_id IS NOT NULL THEN 'terceiro' ELSE 'colaborador' END,
           NULL::text, e.status::text, COALESCE(e.origem, 'sistema'), e.origem,
           left(COALESCE(e.erro_mensagem, ''), 160), '/eventos-jml/' || e.id
      FROM public.eventos_jml e
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  aud AS (
    SELECT 'auditoria'::text, a.id::text, a."timestamp",
           CASE
             WHEN a.entidade IN ('colaboradores', 'colaborador', 'terceiros', 'terceiro', 'pessoa', 'eventos_jml', 'evento_jml', 'colab_quarentena') THEN 'pessoa'
             WHEN a.entidade IN ('perfil_atribuicoes', 'iam_queue', 'excecoes', 'excecao', 'revisoes', 'revisao', 'sod_conflitos', 'entra_role_members', 'contas_admin_conhecidas') THEN 'acesso'
             WHEN a.entidade IN ('aplicacoes', 'perfis_acesso', 'cargos', 'areas', 'empresas', 'localidades', 'licencas', 'regra', 'sharepoint_sites') THEN 'catalogo'
             ELSE 'sistema' END,
           a.acao,
           COALESCE(a.detalhes->>'pessoa', NULL) AS pessoa,
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
     WHERE a.acao NOT IN ('email_revisao', 'enviar_email', 'cron_invoke') -- ruído operacional fica só na auditoria
     ORDER BY 3 DESC LIMIT (SELECT n FROM lim)
  ),
  todos AS (
    SELECT * FROM fila UNION ALL SELECT * FROM jml UNION ALL SELECT * FROM aud
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fonte', fonte, 'id', id, 'ts', ts, 'categoria', categoria, 'acao', acao, 'pessoa', pessoa, 'pessoa_tipo', pessoa_tipo,
           'recurso', recurso, 'status', status, 'ator', ator, 'origem', origem, 'detalhe', detalhe, 'link', link)
           ORDER BY ts DESC), '[]'::jsonb)
    FROM (SELECT * FROM todos WHERE p_categoria IS NULL OR categoria = p_categoria ORDER BY ts DESC LIMIT (SELECT n FROM lim)) x;
$$;
REVOKE ALL ON FUNCTION public.dashboard_activity(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity(integer, text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ix_iam_queue_activity ON public.iam_queue (GREATEST(created_at, COALESCE(processed_at, created_at), COALESCE(approved_at, created_at)) DESC);
CREATE INDEX IF NOT EXISTS ix_eventos_jml_updated ON public.eventos_jml (COALESCE(updated_at, created_at) DESC);

NOTIFY pgrst, 'reload schema';
