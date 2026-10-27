ALTER TABLE public.terceiros ADD COLUMN IF NOT EXISTS conta_servico boolean NOT NULL DEFAULT false;

CREATE TABLE public.contas_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terceiro_id uuid UNIQUE REFERENCES public.terceiros(id),
  nome text NOT NULL,
  email text,
  sam_account_name text,
  entra_id text,
  finalidade text,
  sistemas text,
  criticidade public.criticidade NOT NULL DEFAULT 'media',
  dono_colaborador_id uuid REFERENCES public.colaboradores(id),
  ultima_revalidacao date,
  ativo boolean NOT NULL DEFAULT true,
  entra_ativo boolean,
  ultimo_login timestamptz,
  verificado_em timestamptz,
  verificacao_detalhe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contas_servico TO authenticated;
GRANT ALL ON public.contas_servico TO service_role;
ALTER TABLE public.contas_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Painel le contas de servico" ON public.contas_servico FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'viewer'));
CREATE TRIGGER update_contas_servico_updated_at BEFORE UPDATE ON public.contas_servico FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_iam_backup_contas_servico AFTER INSERT OR DELETE OR UPDATE ON public.contas_servico FOR EACH ROW EXECUTE FUNCTION public.iam_change_backup_trigger();

-- backfill: terceiros marcados como "Conta de Serviço"
INSERT INTO public.contas_servico (terceiro_id, nome, email, sam_account_name, criticidade, dono_colaborador_id, ultima_revalidacao, ativo, created_at)
SELECT id, nome, email, sam_account_name, criticidade, responsavel_colaborador_id, ultima_revalidacao, ativo, created_at
  FROM public.terceiros WHERE empresa_terceira ILIKE 'conta de servi%';
UPDATE public.terceiros SET conta_servico = true WHERE empresa_terceira ILIKE 'conta de servi%';

CREATE OR REPLACE FUNCTION public.conta_servico_salvar(p_id uuid, p_dados jsonb, p_operador text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cs contas_servico%ROWTYPE; v_res jsonb; v_tid uuid; v_dono uuid := NULLIF(p_dados->>'dono_colaborador_id','')::uuid; v_resp text; v_op text := COALESCE(p_operador,'sistema');
BEGIN
  PERFORM public.iam_assert_operator();
  IF COALESCE(trim(p_dados->>'nome'),'') = '' THEN RETURN jsonb_build_object('ok',false,'error','Nome obrigatório'); END IF;
  IF v_dono IS NOT NULL THEN SELECT CASE WHEN email IS NOT NULL THEN nome || ' <' || email || '>' ELSE nome END INTO v_resp FROM colaboradores WHERE id = v_dono; END IF;
  IF p_id IS NOT NULL THEN SELECT * INTO v_cs FROM contas_servico WHERE id = p_id; IF v_cs.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Conta não encontrada'); END IF; END IF;
  IF p_id IS NULL AND COALESCE(trim(p_dados->>'sam_account_name'),'') = '' THEN RETURN jsonb_build_object('ok',false,'error','Login obrigatório'); END IF;
  v_res := public.terceiro_salvar(v_cs.terceiro_id, jsonb_build_object(
    'nome', trim(p_dados->>'nome'), 'email', COALESCE(NULLIF(p_dados->>'email',''), v_cs.email), 'empresa_terceira', 'Conta de Serviço',
    'criticidade', COALESCE(p_dados->>'criticidade','media'), 'responsavel', v_resp, 'responsavel_colaborador_id', v_dono,
    'ativo', COALESCE(v_cs.ativo, true), 'sam_account_name', COALESCE(NULLIF(trim(p_dados->>'sam_account_name'),''), v_cs.sam_account_name)), v_op);
  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN RETURN v_res; END IF;
  v_tid := COALESCE(v_cs.terceiro_id, (v_res->>'id')::uuid);
  UPDATE terceiros SET conta_servico = true WHERE id = v_tid;
  IF p_id IS NULL THEN
    INSERT INTO contas_servico (terceiro_id, nome, email, sam_account_name, finalidade, sistemas, criticidade, dono_colaborador_id, ultima_revalidacao)
    SELECT v_tid, t.nome, t.email, t.sam_account_name, p_dados->>'finalidade', p_dados->>'sistemas', t.criticidade, v_dono, current_date FROM terceiros t WHERE t.id = v_tid
    RETURNING * INTO v_cs;
  ELSE
    UPDATE contas_servico c SET nome = t.nome, email = t.email, sam_account_name = t.sam_account_name, finalidade = p_dados->>'finalidade', sistemas = p_dados->>'sistemas',
      criticidade = t.criticidade, dono_colaborador_id = v_dono FROM terceiros t WHERE c.id = p_id AND t.id = v_tid RETURNING c.* INTO v_cs;
  END IF;
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES (CASE WHEN p_id IS NULL THEN 'conta_servico_criada' ELSE 'conta_servico_atualizada' END, 'contas_servico', v_cs.id::text, v_op,
          format('Conta de serviço %s %s', v_cs.nome, CASE WHEN p_id IS NULL THEN 'cadastrada' ELSE 'atualizada' END));
  RETURN v_res || jsonb_build_object('ok', true, 'id', v_cs.id);
END $$;

CREATE OR REPLACE FUNCTION public.conta_servico_alterar_status(p_id uuid, p_ativo boolean, p_operador text DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cs contas_servico%ROWTYPE; v_res jsonb; v_op text := COALESCE(p_operador,'sistema');
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT * INTO v_cs FROM contas_servico WHERE id = p_id;
  IF v_cs.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Conta não encontrada'); END IF;
  IF NOT p_ativo AND length(COALESCE(trim(p_motivo),'')) < 5 THEN RETURN jsonb_build_object('ok',false,'error','Informe o motivo'); END IF;
  v_res := public.terceiro_alterar_status(v_cs.terceiro_id, p_ativo, v_op, 'conta_servico', p_motivo);
  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN RETURN v_res; END IF;
  UPDATE contas_servico SET ativo = p_ativo, ultima_revalidacao = CASE WHEN p_ativo THEN current_date ELSE ultima_revalidacao END WHERE id = p_id;
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES (CASE WHEN p_ativo THEN 'conta_servico_reativada' ELSE 'conta_servico_desativada' END, 'contas_servico', p_id::text, v_op,
          format('Conta de serviço %s %s', v_cs.nome, CASE WHEN p_ativo THEN 'reativada' ELSE 'desativada' END), jsonb_build_object('motivo', p_motivo));
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.conta_servico_revalidar(p_id uuid, p_operador text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cs contas_servico%ROWTYPE;
BEGIN
  PERFORM public.iam_assert_operator();
  UPDATE contas_servico SET ultima_revalidacao = current_date WHERE id = p_id RETURNING * INTO v_cs;
  IF v_cs.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Conta não encontrada'); END IF;
  UPDATE terceiros SET ultima_revalidacao = current_date WHERE id = v_cs.terceiro_id;
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('conta_servico_revalidada', 'contas_servico', p_id::text, COALESCE(p_operador,'sistema'), format('Conta de serviço %s revalidada', v_cs.nome));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.conta_servico_mover_de_terceiro(p_terceiro_id uuid, p_operador text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_nome text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF EXISTS (SELECT 1 FROM contas_servico WHERE terceiro_id = p_terceiro_id) THEN RETURN jsonb_build_object('ok',false,'error','Já é conta de serviço'); END IF;
  INSERT INTO contas_servico (terceiro_id, nome, email, sam_account_name, criticidade, dono_colaborador_id, ultima_revalidacao, ativo)
  SELECT id, nome, email, sam_account_name, criticidade, responsavel_colaborador_id, ultima_revalidacao, ativo FROM terceiros WHERE id = p_terceiro_id
  RETURNING id, nome INTO v_id, v_nome;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Terceiro não encontrado'); END IF;
  UPDATE terceiros SET conta_servico = true, empresa_terceira = 'Conta de Serviço' WHERE id = p_terceiro_id;
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('conta_servico_movida', 'contas_servico', v_id::text, COALESCE(p_operador,'sistema'), format('%s movido de Terceiros para Contas de serviço', v_nome));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.conta_servico_salvar(uuid, jsonb, text), public.conta_servico_alterar_status(uuid, boolean, text, text), public.conta_servico_revalidar(uuid, text), public.conta_servico_mover_de_terceiro(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conta_servico_salvar(uuid, jsonb, text), public.conta_servico_alterar_status(uuid, boolean, text, text), public.conta_servico_revalidar(uuid, text), public.conta_servico_mover_de_terceiro(uuid, text) TO authenticated, service_role;

-- contas de serviço não entram na revalidação de terceiros por e-mail
CREATE OR REPLACE FUNCTION public.revisao_criar_por_responsaveis(p_data_fim date DEFAULT NULL::date, p_operador text DEFAULT NULL::text, p_somente_vencidos boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record; v jsonb; v_per int; v_email text;
  v_criadas int := 0; v_existentes int := 0; v_sem_email int := 0; v_ids uuid[] := '{}'; v_sem_resp text[] := '{}';
BEGIN
  PERFORM public.iam_assert_operator();
  v_per := COALESCE(NULLIF(public.iam_param('terceiro_revalidacao_dias', '45'), '')::int, 45);
  FOR r IN
    SELECT t.responsavel_colaborador_id AS gestor_id, NULLIF(trim(COALESCE(t.responsavel, '')), '') AS responsavel, array_agg(t.nome ORDER BY t.nome) AS nomes
      FROM public.terceiros t
     WHERE t.ativo AND NOT t.conta_servico AND (t.contrato_fim IS NULL OR t.contrato_fim >= current_date)
       AND (NOT p_somente_vencidos OR COALESCE(t.ultima_revalidacao, t.contrato_inicio, t.created_at::date) + v_per <= current_date)
     GROUP BY 1, 2
  LOOP
    IF r.gestor_id IS NULL AND r.responsavel IS NULL THEN v_sem_resp := v_sem_resp || r.nomes; CONTINUE; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.agent_refresh_request(p_task text, p_min_interval_min integer DEFAULT 15)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_last timestamptz; v_open boolean; v_id uuid; v_op text;
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('sync-entra-groups','sync-entra-licencas','sync-entra-roles',
    'sync-sharepoint-sites','sync-app-profiles','quarantine-triage','audit-reconciliation','test-app-connection','sync-service-accounts') THEN
    RAISE EXCEPTION 'task_invalida';
  END IF;
  SELECT max(COALESCE(finished_at, created_at)) INTO v_last FROM public.agent_tasks WHERE task = p_task;
  SELECT EXISTS (SELECT 1 FROM public.agent_tasks WHERE task = p_task AND status IN ('pending','running')) INTO v_open;
  IF v_open OR (v_last IS NOT NULL AND v_last > now() - make_interval(mins => GREATEST(p_min_interval_min, 1))) THEN
    RETURN jsonb_build_object('queued', false, 'open', v_open, 'last_at', v_last);
  END IF;
  SELECT email INTO v_op FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.agent_tasks (task, requested_by) VALUES (p_task, COALESCE('auto:' || v_op, 'auto:sistema')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('queued', true, 'id', v_id, 'last_at', v_last);
END $function$;

CREATE OR REPLACE FUNCTION public.agent_task_solicitar(p_task text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_op text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador') OR public.has_role(auth.uid(), 'platform_admin')) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('sync-sharepoint-csv','reconcile-identities','expire-access-exceptions','auto-recertification',
    'audit-reconciliation','sync-entra-groups','sync-entra-apps','sync-entra-licencas','sync-entra-roles',
    'sync-sharepoint-sites','sync-app-profiles','sync-user-access','sync-service-accounts') THEN
    RAISE EXCEPTION 'task_invalida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_tasks WHERE task = p_task AND status IN ('pending','running')) THEN
    RAISE EXCEPTION 'Já existe um pedido em aberto para esta rotina';
  END IF;
  SELECT email INTO v_op FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.agent_tasks (task, requested_by) VALUES (p_task, COALESCE(v_op, 'sistema')) RETURNING id INTO v_id;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('agent_task_solicitada', 'agent_tasks', v_id::text, COALESCE(v_op, 'sistema'), 'Execução solicitada ao Hermes: ' || p_task);
  RETURN v_id;
END $function$;