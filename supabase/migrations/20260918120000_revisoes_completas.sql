-- =============================================================================
-- Revisão de acessos completa e executável
--
-- Antes: campanha só por aplicação; e-mail do owner quebrado ("Nome <email>" ou
-- id de colaborador); sem decisão interna item a item; terceiros de fora;
-- concessões individuais fora; e a revogação decidida pelo gestor ainda caía na
-- fila "aguardando aprovação" (nunca executava sozinha).
--
-- Agora:
--   • revisao_criar(tipo aplicacao | gestor): itens = perfis ativos + concessões
--     individuais da aplicação / da equipe do gestor (colaboradores e terceiros)
--   • revisao_decidir_itens / revisao_concluir: decisão registrada (quem/quando/
--     justificativa) e, ao concluir, as revogações entram na fila JÁ APROVADAS —
--     a decisão do gestor é a aprovação; o Órigo Agente executa sem outra etapa
--   • iam_resolve_email: resolve "Nome <email>", e-mail puro ou nome → e-mail
--   • contadores de progresso mantidos por trigger; lembretes/atraso pela agenda
-- =============================================================================

ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'perfil';
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS resource_key text;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS recurso_nome text;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS decidido_por text;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS executado_em timestamptz;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS cargo_nome text;
ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS area_nome text;
CREATE INDEX IF NOT EXISTS idx_revisao_itens_revisao ON public.revisao_itens (revisao_id);

ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS lembrete_enviado_em timestamptz;
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS concluida_em timestamptz;
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS concluida_por text;
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS resultado jsonb;
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS criada_por text;

-- ---------------------------------------------------------------------------
-- Progresso mantido por trigger (antes só era atualizado ao concluir)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisao_itens_recount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid := COALESCE(NEW.revisao_id, OLD.revisao_id);
BEGIN
  UPDATE public.revisoes r
     SET total_itens = s.total, itens_revisados = s.decididos
    FROM (SELECT count(*) AS total, count(*) FILTER (WHERE decisao IS NOT NULL) AS decididos FROM public.revisao_itens WHERE revisao_id = v_id) s
   WHERE r.id = v_id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_revisao_itens_recount ON public.revisao_itens;
CREATE TRIGGER trg_revisao_itens_recount AFTER INSERT OR UPDATE OF decisao OR DELETE ON public.revisao_itens
  FOR EACH ROW EXECUTE FUNCTION public.revisao_itens_recount();

-- ---------------------------------------------------------------------------
-- Gate de aprovação: itens PRÉ-APROVADOS por uma decisão formal (revisão de
-- acesso) entram como pending com approved_at — sem segunda aprovação.
-- O flag só é definido por RPCs SECURITY DEFINER (revisao_concluir).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_apply_approval_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate_on boolean := false;
  v_pre   text := current_setting('origo.pre_approved', true);
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(v_pre, '') <> '' THEN
    NEW.approved_at := now();
    NEW.payload_json := COALESCE(NEW.payload_json, '{}'::jsonb) || jsonb_build_object('aprovacao', v_pre::jsonb);
    RETURN NEW;
  END IF;
  SELECT COALESCE((valor = 'true'), false) INTO gate_on FROM public.parametros WHERE chave = 'iam_approval_required';
  IF gate_on THEN
    NEW.status := 'waiting_approval';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- "Nome <email>" | e-mail | nome de colaborador/usuário → e-mail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_resolve_email(p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v text := trim(COALESCE(p_text, '')); v_m text[]; v_email text;
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  v_m := regexp_match(v, '<([^>]+@[^>]+)>');
  IF v_m IS NOT NULL THEN RETURN lower(trim(v_m[1])); END IF;
  IF v ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN lower(v); END IF;
  IF v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN
    SELECT email INTO v_email FROM public.colaboradores WHERE id::text = v;
    IF v_email IS NOT NULL THEN RETURN lower(v_email); END IF;
  END IF;
  SELECT email INTO v_email FROM public.colaboradores WHERE lower(nome) = lower(v) AND email IS NOT NULL ORDER BY (status = 'ativo') DESC LIMIT 1;
  IF v_email IS NOT NULL THEN RETURN lower(v_email); END IF;
  SELECT email INTO v_email FROM public.profiles WHERE lower(nome) = lower(v) LIMIT 1;
  RETURN lower(v_email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.iam_resolve_email(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Criação de campanha
--   tipo = 'aplicacao' → owner revisa quem tem a aplicação (perfis + concessões individuais)
--   tipo = 'gestor'    → gestor revisa todos os acessos da sua equipe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisao_criar(
  p_tipo text, p_aplicacao_id uuid DEFAULT NULL, p_gestor_id uuid DEFAULT NULL,
  p_data_fim date DEFAULT NULL, p_nome text DEFAULT NULL, p_operador text DEFAULT NULL)
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
  v_id      uuid;
  v_exist   uuid;
  v_n       int := 0;
  v_perfis  uuid[];
  v_key     text;
  r         record;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = auth.uid();
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF p_tipo NOT IN ('aplicacao', 'gestor') THEN RETURN jsonb_build_object('ok', false, 'error', 'tipo deve ser aplicacao ou gestor'); END IF;

  IF p_tipo = 'aplicacao' THEN
    SELECT * INTO v_app FROM public.aplicacoes WHERE id = p_aplicacao_id;
    IF v_app.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Aplicação não encontrada'); END IF;
    SELECT id INTO v_exist FROM public.revisoes WHERE aplicacao_id = v_app.id AND status = 'em_andamento' LIMIT 1;
    IF v_exist IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_exist, 'existente', true); END IF;
    v_nome  := COALESCE(NULLIF(trim(p_nome), ''), 'Revisão — ' || v_app.nome);
    v_owner := v_app.owner;
    v_email := public.iam_resolve_email(v_app.owner);
  ELSE
    SELECT * INTO v_gestor FROM public.colaboradores WHERE id = p_gestor_id;
    IF v_gestor.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Gestor não encontrado'); END IF;
    SELECT id INTO v_exist FROM public.revisoes WHERE gestor_id = v_gestor.id AND status = 'em_andamento' LIMIT 1;
    IF v_exist IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'id', v_exist, 'existente', true); END IF;
    v_nome  := COALESCE(NULLIF(trim(p_nome), ''), 'Revisão — equipe de ' || v_gestor.nome);
    v_owner := v_gestor.nome;
    v_email := lower(v_gestor.email);
  END IF;

  INSERT INTO public.revisoes (nome, descricao, status, responsavel, data_inicio, data_fim, total_itens, itens_revisados, token, aplicacao_id, gestor_id, owner_email, tipo, criada_por)
  VALUES (v_nome,
          CASE WHEN p_tipo = 'aplicacao' THEN 'Quem tem acesso a ' || v_app.nome || ' — manter ou revogar. Revogações são executadas automaticamente pelo agente.'
               ELSE 'Acessos da equipe de ' || v_gestor.nome || ' — manter ou revogar. Revogações são executadas automaticamente pelo agente.' END,
          'em_andamento', v_owner, current_date, p_data_fim, 0, 0, gen_random_uuid()::text, v_app.id, v_gestor.id, v_email, p_tipo, v_op)
  RETURNING id INTO v_id;

  IF p_tipo = 'aplicacao' THEN
    SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_perfis FROM public.perfil_aplicacoes WHERE aplicacao_id = v_app.id;
    -- perfis ativos que concedem a aplicação
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
    -- concessões individuais da aplicação (última assign_app com sucesso sem remove depois)
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
  ELSE
    -- equipe do gestor: todos os perfis ativos + concessões individuais
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
  END IF;

  SELECT total_itens INTO v_n FROM public.revisoes WHERE id = v_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('criar_revisao', 'revisoes', v_id::text, v_op, format('Campanha criada: %s (%s itens, responsável %s)', v_nome, v_n, COALESCE(v_email, v_owner, '—')),
          jsonb_build_object('tipo', p_tipo, 'aplicacao_id', v_app.id, 'gestor_id', v_gestor.id, 'data_fim', p_data_fim));
  INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Revisão de acesso criada: ' || v_nome, format('%s item(ns) para %s decidir%s.', v_n, COALESCE(v_email, v_owner, 'o responsável'),
          CASE WHEN p_data_fim IS NOT NULL THEN ' até ' || to_char(p_data_fim, 'DD/MM/YYYY') ELSE '' END),
          'info', 'recertificacao', 'revisao', v_id::text, '/revisoes/' || v_id);
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'existente', false, 'total_itens', v_n, 'owner_email', v_email, 'sem_email', v_email IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_criar(text, uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_criar(text, uuid, uuid, date, text, text) TO authenticated, service_role;

-- uma campanha por gestor com equipe (ciclo de recertificação por gestor)
CREATE OR REPLACE FUNCTION public.revisao_criar_por_gestores(p_data_fim date DEFAULT NULL, p_operador text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v jsonb; v_criadas int := 0; v_existentes int := 0; v_sem_email int := 0; v_ids uuid[] := '{}';
BEGIN
  PERFORM public.iam_assert_operator();
  FOR r IN SELECT DISTINCT g.id FROM public.colaboradores c JOIN public.colaboradores g ON g.id = c.gestor_id
            WHERE c.status::text IN ('ativo','ferias','afastado') AND g.status::text IN ('ativo','ferias','afastado') LOOP
    v := public.revisao_criar('gestor', NULL, r.id, p_data_fim, NULL, p_operador);
    IF (v->>'ok')::boolean THEN
      IF (v->>'existente')::boolean THEN v_existentes := v_existentes + 1;
      ELSE v_criadas := v_criadas + 1; v_ids := array_append(v_ids, (v->>'id')::uuid);
        IF (v->>'sem_email')::boolean THEN v_sem_email := v_sem_email + 1; END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'criadas', v_criadas, 'existentes', v_existentes, 'sem_email', v_sem_email, 'ids', to_jsonb(v_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_criar_por_gestores(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_criar_por_gestores(date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisões (sem executar) — usada pela tela interna, pelo link externo e pelo MCP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisao_decidir_itens(
  p_revisao_id uuid, p_decisoes jsonb, p_justificativas jsonb DEFAULT '{}'::jsonb, p_decidido_por text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_por text; v_status text; v_item record; v_n int := 0; v_k text; v_d text;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_decidido_por, email) INTO v_por FROM public.profiles WHERE id = auth.uid();
  v_por := COALESCE(v_por, p_decidido_por, 'revisor');
  SELECT status::text INTO v_status FROM public.revisoes WHERE id = p_revisao_id;
  IF v_status IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão não encontrada'); END IF;
  IF v_status <> 'em_andamento' THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão já ' || v_status); END IF;
  FOR v_k, v_d IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_decisoes, '{}'::jsonb)) LOOP
    IF v_d NOT IN ('manter', 'revogar') THEN CONTINUE; END IF;
    UPDATE public.revisao_itens
       SET decisao = v_d, decidido_em = now(), decidido_por = v_por,
           justificativa = COALESCE(p_justificativas ->> v_k, justificativa)
     WHERE id = v_k::uuid AND revisao_id = p_revisao_id AND executado_em IS NULL;
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'decididos', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_decidir_itens(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_decidir_itens(uuid, jsonb, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Conclusão: aplica as decisões. Revogações entram na fila PRÉ-APROVADAS
-- (a decisão do gestor/owner é a aprovação) e o agente executa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revisao_concluir(p_revisao_id uuid, p_decidido_por text DEFAULT NULL)
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
  v_mant    int := 0; v_rev_n int := 0; v_pend int := 0; v_acoes int := 0; v_n int;
  v_req     text := 'revisao:' || p_revisao_id::text;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_decidido_por, email) INTO v_por FROM public.profiles WHERE id = auth.uid();
  v_por := COALESCE(v_por, p_decidido_por, 'revisor');
  SELECT * INTO v_rev FROM public.revisoes WHERE id = p_revisao_id FOR UPDATE;
  IF v_rev.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão não encontrada'); END IF;
  IF v_rev.status::text <> 'em_andamento' THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão já ' || v_rev.status::text); END IF;

  -- itens desta revisão nascem aprovados: quem decidiu foi o responsável pela recertificação
  PERFORM set_config('origo.pre_approved', jsonb_build_object('origem', 'revisao', 'ref', p_revisao_id, 'por', v_por, 'em', now())::text, true);

  FOR v_item IN SELECT * FROM public.revisao_itens WHERE revisao_id = p_revisao_id ORDER BY colaborador_nome LOOP
    IF v_item.decisao IS NULL THEN v_pend := v_pend + 1; CONTINUE; END IF;
    IF v_item.decisao = 'manter' THEN v_mant := v_mant + 1; CONTINUE; END IF;
    IF v_item.executado_em IS NOT NULL THEN v_rev_n := v_rev_n + 1; CONTINUE; END IF;
    v_rev_n := v_rev_n + 1;

    IF v_item.tipo = 'perfil' AND v_item.perfil_id IS NOT NULL THEN
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

  UPDATE public.revisoes
     SET status = 'concluida', concluida_em = now(), concluida_por = v_por,
         resultado = jsonb_build_object('mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes)
   WHERE id = p_revisao_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('concluir_revisao', 'revisoes', p_revisao_id::text, v_por,
          format('Revisão "%s" concluída: %s mantidos, %s revogados, %s pendentes, %s ação(ões) enfileirada(s) já aprovadas para o agente', v_rev.nome, v_mant, v_rev_n, v_pend, v_acoes),
          jsonb_build_object('mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes));
  INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Revisão concluída: ' || v_rev.nome,
          format('%s decidiu: %s mantidos, %s revogados. %s remoção(ões) entraram na fila já aprovadas — o agente executa automaticamente.', v_por, v_mant, v_rev_n, v_acoes),
          (CASE WHEN v_rev_n > 0 THEN 'aviso' ELSE 'info' END)::severidade_alerta, 'revisao_concluida', 'revisao', p_revisao_id::text, '/revisoes/' || p_revisao_id);
  RETURN jsonb_build_object('ok', true, 'mantidos', v_mant, 'revogados', v_rev_n, 'pendentes', v_pend, 'acoes', v_acoes, 'owner_email', v_rev.owner_email, 'nome', v_rev.nome);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_concluir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_concluir(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revisao_cancelar(p_revisao_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_por text; v_nome text;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_por FROM public.profiles WHERE id = auth.uid();
  UPDATE public.revisoes SET status = 'cancelada', concluida_em = now(), concluida_por = COALESCE(v_por, 'sistema'), resultado = jsonb_build_object('cancelada', true, 'motivo', p_motivo)
   WHERE id = p_revisao_id AND status = 'em_andamento' RETURNING nome INTO v_nome;
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Revisão não está em andamento'); END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('cancelar_revisao', 'revisoes', p_revisao_id::text, COALESCE(v_por, 'sistema'), format('Campanha cancelada: %s%s', v_nome, CASE WHEN p_motivo IS NOT NULL THEN ' — ' || p_motivo ELSE '' END));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.revisao_cancelar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisao_cancelar(uuid, text) TO authenticated, service_role;

-- caixa de entrada do Hermes: tudo o que pede decisão/ação, numa chamada
CREATE OR REPLACE FUNCTION public.hermes_inbox()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'fila', public.iam_queue_stats(),
    'aprovacoes_pendentes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'action_type', action_type, 'target', target_identity, 'requested_by', requested_by, 'created_at', created_at, 'reason', payload_json->>'reason') ORDER BY created_at), '[]'::jsonb)
                              FROM (SELECT * FROM iam_queue WHERE status = 'waiting_approval' ORDER BY created_at LIMIT 50) w),
    'falhas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'action_type', action_type, 'target', target_identity, 'error_code', error_code, 'result_message', left(result_message, 200)) ORDER BY processed_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM iam_queue WHERE status = 'failed' ORDER BY processed_at DESC NULLS LAST LIMIT 50) f),
    'excecoes_pendentes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo_excecao, 'colaborador', colaborador_nome, 'colaborador_id', colaborador_id, 'perfil', perfil_solicitado, 'solicitante', solicitante, 'justificativa', justificativa, 'validade', validade)), '[]'::jsonb)
                              FROM excecoes WHERE status = 'pendente'),
    'revisoes_abertas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'tipo', tipo, 'responsavel', responsavel, 'owner_email', owner_email, 'data_fim', data_fim, 'total', total_itens, 'decididos', itens_revisados, 'atrasada', data_fim IS NOT NULL AND data_fim < current_date)), '[]'::jsonb)
                            FROM revisoes WHERE status = 'em_andamento'),
    'quarentena', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'matricula', matricula, 'email', email, 'motivo', motivo, 'detalhe', detalhe, 'colaborador_id', colaborador_id)), '[]'::jsonb)
                     FROM (SELECT * FROM colab_quarentena WHERE status = 'pendente' ORDER BY created_at DESC LIMIT 50) q),
    'terceiros_atencao', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'empresa', empresa_terceira, 'contrato_fim', contrato_fim, 'responsavel', responsavel, 'ultima_revalidacao', ultima_revalidacao,
                                                       'situacao', CASE WHEN contrato_fim < current_date THEN 'vencido' WHEN contrato_fim <= current_date + 30 THEN 'vencendo' ELSE 'revalidar' END)), '[]'::jsonb)
                            FROM terceiros WHERE ativo AND (
                                 (contrato_fim IS NOT NULL AND contrato_fim <= current_date + 30)
                              OR COALESCE(ultima_revalidacao, contrato_inicio, created_at::date) < current_date - COALESCE(public.iam_param('terceiro_revalidacao_dias','45')::int, 45))),
    'alertas_criticos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'mensagem', left(mensagem, 200), 'tipo', tipo, 'ref_url', ref_url, 'data', data) ORDER BY data DESC), '[]'::jsonb)
                           FROM (SELECT * FROM alertas WHERE NOT lido AND severidade::text = 'critico' ORDER BY data DESC LIMIT 30) a),
    'agente', (SELECT COALESCE(jsonb_agg(jsonb_build_object('owner', owner, 'last_seen_at', last_seen_at, 'online', last_seen_at > now() - interval '5 minutes', 'version', version, 'execute_mode', execute_mode)), '[]'::jsonb) FROM iam_agent_status),
    'ultimo_ciclo', (SELECT jsonb_build_object('status', status, 'message', message, 'updated_at', updated_at) FROM sync_jobs WHERE tipo = 'daily_cycle' ORDER BY created_at DESC LIMIT 1),
    'gerado_em', now());
$$;
REVOKE ALL ON FUNCTION public.hermes_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hermes_inbox() TO authenticated, service_role;

-- revalidação de terceiro pelo responsável (via UI/MCP): registra e reinicia o prazo
CREATE OR REPLACE FUNCTION public.terceiro_revalidar(p_terceiro_id uuid, p_novo_contrato_fim date DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_por text; v_nome text;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_por FROM public.profiles WHERE id = auth.uid();
  UPDATE public.terceiros SET ultima_revalidacao = current_date, contrato_fim = COALESCE(p_novo_contrato_fim, contrato_fim)
   WHERE id = p_terceiro_id RETURNING nome INTO v_nome;
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Terceiro não encontrado'); END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('revalidar_terceiro', 'terceiros', p_terceiro_id::text, COALESCE(v_por, 'sistema'),
          format('Terceiro %s revalidado%s', v_nome, CASE WHEN p_novo_contrato_fim IS NOT NULL THEN ' — contrato até ' || to_char(p_novo_contrato_fim, 'DD/MM/YYYY') ELSE '' END),
          jsonb_build_object('motivo', p_motivo, 'novo_contrato_fim', p_novo_contrato_fim));
  UPDATE public.alertas SET lido = true WHERE tipo = 'revalidacao_terceiro' AND ref_id = p_terceiro_id::text AND NOT lido;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.terceiro_revalidar(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terceiro_revalidar(uuid, date, text) TO authenticated, service_role;

-- quarentena: decisão registrada (o RH corrige a base; a próxima importação reavalia)
CREATE OR REPLACE FUNCTION public.quarentena_decidir(p_id uuid, p_status text, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_por text; v_row colab_quarentena%ROWTYPE;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_status NOT IN ('resolvido', 'descartado') THEN RETURN jsonb_build_object('ok', false, 'error', 'status deve ser resolvido ou descartado'); END IF;
  SELECT email INTO v_por FROM public.profiles WHERE id = auth.uid();
  UPDATE public.colab_quarentena SET status = p_status, decidido_por = COALESCE(v_por, 'sistema'), decidido_em = now()
   WHERE id = p_id AND status = 'pendente' RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Item não está pendente'); END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('quarentena_' || p_status, 'colab_quarentena', p_id::text, COALESCE(v_por, 'sistema'),
          format('Linha em quarentena (%s, %s) marcada como %s%s', COALESCE(v_row.nome, v_row.matricula, '?'), v_row.motivo, p_status, CASE WHEN p_observacao IS NOT NULL THEN ' — ' || p_observacao ELSE '' END));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.quarentena_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quarentena_decidir(uuid, text, text) TO authenticated, service_role;

-- alertas: marcar lidos em lote (UI e MCP)
CREATE OR REPLACE FUNCTION public.alertas_marcar_lidos(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  PERFORM public.iam_assert_operator();
  UPDATE public.alertas SET lido = true WHERE NOT lido AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.alertas_marcar_lidos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alertas_marcar_lidos(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Terceiros: a notificação de revalidação não conta como revalidação
-- (antes o job gravava ultima_revalidacao ao avisar — a revalidação nunca acontecia)
-- ---------------------------------------------------------------------------
ALTER TABLE public.terceiros ADD COLUMN IF NOT EXISTS revalidacao_notificada_em timestamptz;

INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('revisao_gestor_periodicidade_dias', '180', 'Periodicidade (dias) das revisões por gestor (cada gestor revisa os acessos da sua equipe); 0 desliga')
ON CONFLICT (chave) DO UPDATE SET descricao = EXCLUDED.descricao;

-- revisoes.aplicacao_id nunca teve FK (embeds `aplicacoes(nome)` no PostgREST falhavam)
UPDATE public.revisoes r SET aplicacao_id = NULL
 WHERE aplicacao_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.aplicacoes a WHERE a.id = r.aplicacao_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revisoes_aplicacao_id_fkey') THEN
    ALTER TABLE public.revisoes ADD CONSTRAINT revisoes_aplicacao_id_fkey
      FOREIGN KEY (aplicacao_id) REFERENCES public.aplicacoes(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_revisoes_aplicacao ON public.revisoes (aplicacao_id);
CREATE INDEX IF NOT EXISTS ix_revisoes_gestor ON public.revisoes (gestor_id);
CREATE INDEX IF NOT EXISTS ix_revisoes_status ON public.revisoes (status);
NOTIFY pgrst, 'reload schema';

-- O link externo também é aberto por quem já está logado no painel (owner/gestor que é
-- operador): o token é a autorização, a role do JWT não importa
GRANT EXECUTE ON FUNCTION public.get_revisao_by_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revisao_itens_by_token(text) TO anon, authenticated, service_role;
