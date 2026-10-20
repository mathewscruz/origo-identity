ALTER TABLE public.aplicacoes
  ADD COLUMN IF NOT EXISTS owner_colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisor_colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modo_acesso text NOT NULL DEFAULT 'sso',
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.entra_grupos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS instrucoes_acesso text,
  ADD COLUMN IF NOT EXISTS instrucoes_revogacao text,
  ADD COLUMN IF NOT EXISTS teste_status text,
  ADD COLUMN IF NOT EXISTS teste_em timestamptz,
  ADD COLUMN IF NOT EXISTS teste_detalhe text;
COMMENT ON COLUMN public.aplicacoes.modo_acesso IS 'sso (Entra app) | grupo | api | manual';

CREATE TABLE IF NOT EXISTS public.aplicacao_chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id uuid NOT NULL REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  msg_id text NOT NULL,
  role text NOT NULL,
  message jsonb NOT NULL,
  autor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aplicacao_id, msg_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aplicacao_chat_mensagens TO authenticated;
GRANT ALL ON public.aplicacao_chat_mensagens TO service_role;
ALTER TABLE public.aplicacao_chat_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem conversa" ON public.aplicacao_chat_mensagens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin'));
CREATE POLICY "operadores escrevem conversa" ON public.aplicacao_chat_mensagens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'platform_admin'));

-- Recursos de aplicação conforme a forma de acesso
CREATE OR REPLACE FUNCTION public.iam_resource_template(p_tipo text, p_ref_id uuid, p_pasta_id uuid DEFAULT NULL::uuid, p_permissao text DEFAULT NULL::text, p_perfil_interno_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tipo text, resource_key text, action_assign text, action_remove text, payload jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT 'grupo', 'grupo:' || g.entra_id, 'assign_group', 'remove_group',
         jsonb_build_object('groupId', g.entra_id, 'groupName', g.nome, 'onPremisesSync', COALESCE(g.on_premises_sync, false))
    FROM entra_grupos g WHERE p_tipo = 'grupo' AND g.id = p_ref_id AND g.entra_id IS NOT NULL
  UNION ALL
  SELECT 'licenca', 'licenca:' || l.sku_id, 'assign_license', 'remove_license',
         jsonb_build_object('skuId', l.sku_id, 'licenseName', l.nome)
    FROM entra_licencas l WHERE p_tipo = 'licenca' AND l.id = p_ref_id AND l.sku_id IS NOT NULL
  UNION ALL
  SELECT 'app', 'app:' || a.entra_id, 'assign_app', 'remove_app',
         jsonb_build_object('appId', a.entra_id, 'appName', a.nome,
                            'appRoleId', COALESCE(NULLIF(a.default_app_role_id,''), '00000000-0000-0000-0000-000000000000'))
    FROM aplicacoes a WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.entra_id IS NOT NULL AND a.modo_acesso = 'sso'
  UNION ALL
  -- aplicação liberada por grupo: vira entrada/saída do grupo
  SELECT 'grupo', 'grupo:' || g.entra_id, 'assign_group', 'remove_group',
         jsonb_build_object('groupId', g.entra_id, 'groupName', g.nome, 'onPremisesSync', COALESCE(g.on_premises_sync, false), 'appName', a.nome)
    FROM aplicacoes a JOIN entra_grupos g ON g.id = a.grupo_id
   WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.modo_acesso = 'grupo' AND g.entra_id IS NOT NULL
  UNION ALL
  -- aplicação por API: conector do app
  SELECT 'app_interno', 'app_interno:' || a.id::text || ':', 'create_user_app', 'disable_user_app',
         jsonb_build_object('aplicacao_id', a.id, 'appName', a.nome, 'perfil_interno_id', NULL)
    FROM aplicacoes a WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.modo_acesso = 'api' AND a.integracao_ativa = true
  UNION ALL
  -- aplicação manual: tarefa para o dono, com instruções
  SELECT 'manual', 'manual:' || a.id::text, 'manual_access_task', 'manual_revoke_task',
         jsonb_build_object('aplicacao_id', a.id, 'appName', a.nome, 'instrucoes', a.instrucoes_acesso,
                            'instrucoesRevogacao', a.instrucoes_revogacao, 'ownerColaboradorId', a.owner_colaborador_id)
    FROM aplicacoes a WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.modo_acesso = 'manual'
  UNION ALL
  SELECT 'app_interno', 'app_interno:' || a.id::text || ':' || COALESCE(p_perfil_interno_id::text, ''), 'create_user_app', 'disable_user_app',
         jsonb_build_object('aplicacao_id', a.id, 'appName', a.nome, 'perfil_interno_id', p_perfil_interno_id)
    FROM aplicacoes a WHERE p_tipo = 'app_interno' AND a.id = p_ref_id AND a.integracao_ativa = true AND COALESCE(a.connector_type,'manual') <> 'manual'
  UNION ALL
  SELECT 'sharepoint',
         'sharepoint:' || s.site_id || ':' || COALESCE(p.drive_item_id, '') || ':' || COALESCE(p_permissao, 'leitura'),
         'assign_sharepoint', 'remove_sharepoint',
         jsonb_build_object('resourceType', 'sharepoint', 'siteId', s.site_id, 'siteName', s.nome, 'siteUrl', s.url,
                            'driveItemId', p.drive_item_id, 'folderName', p.nome, 'folderPath', p.caminho,
                            'permission', COALESCE(p_permissao, 'leitura'))
    FROM sharepoint_sites s LEFT JOIN sharepoint_pastas p ON p.id = p_pasta_id
   WHERE p_tipo = 'sharepoint' AND s.id = p_ref_id AND s.site_id IS NOT NULL;
$function$;

-- Tarefa manual: alerta ao dono (o Hermes repassa pelo Telegram dele)
CREATE OR REPLACE FUNCTION public.iam_queue_manual_task_alert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa text; v_dono text;
BEGIN
  IF NEW.action_type NOT IN ('manual_access_task','manual_revoke_task') OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT COALESCE(c.nome, t.nome, NEW.target_identity) INTO v_pessoa
    FROM (SELECT 1) x LEFT JOIN colaboradores c ON c.id = NEW.colaborador_id LEFT JOIN terceiros t ON t.id = NEW.terceiro_id;
  SELECT nome INTO v_dono FROM colaboradores WHERE id = NULLIF(NEW.payload_json->>'ownerColaboradorId','')::uuid;
  INSERT INTO alertas (tipo, severidade, titulo, mensagem, ref_tipo, ref_id, ref_url)
  VALUES ('manual_access_task', 'aviso',
    CASE WHEN NEW.action_type = 'manual_access_task' THEN 'Dar acesso manual: ' ELSE 'Retirar acesso manual: ' END || COALESCE(NEW.payload_json->>'appName','sistema'),
    format('%s precisa %s %s.%s Responsável: %s. Confirme na tela quando concluir.',
      COALESCE(v_pessoa,'Pessoa'), CASE WHEN NEW.action_type = 'manual_access_task' THEN 'receber acesso ao' ELSE 'perder o acesso ao' END,
      COALESCE(NEW.payload_json->>'appName','sistema'),
      COALESCE(' Como fazer: ' || NULLIF(CASE WHEN NEW.action_type = 'manual_access_task' THEN NEW.payload_json->>'instrucoes' ELSE NEW.payload_json->>'instrucoesRevogacao' END, '') || '.', ''),
      COALESCE(v_dono, 'dono não definido')),
    'iam_queue', NEW.id::text, '/fila-provisionamento/' || NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS iam_queue_manual_task_alert ON public.iam_queue;
CREATE TRIGGER iam_queue_manual_task_alert AFTER INSERT OR UPDATE OF status ON public.iam_queue
FOR EACH ROW EXECUTE FUNCTION public.iam_queue_manual_task_alert();

-- Confirmação humana da tarefa manual
CREATE OR REPLACE FUNCTION public.iam_manual_task_concluir(p_id uuid, p_observacao text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_op text; v_n int;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_op FROM profiles WHERE id = auth.uid();
  UPDATE iam_queue SET status = 'success', processed_by = COALESCE(v_op,'operador'),
         result_message = 'Concluído manualmente' || COALESCE(' — ' || p_observacao, '')
   WHERE id = p_id AND status = 'pending' AND action_type IN ('manual_access_task','manual_revoke_task');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Tarefa não está pendente'); END IF;
  UPDATE alertas SET lido = true WHERE ref_tipo = 'iam_queue' AND ref_id = p_id::text;
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('manual_task_concluida', 'iam_queue', p_id::text, COALESCE(v_op,'operador'), 'Acesso manual confirmado na tela' || COALESCE(' — ' || p_observacao, ''));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.iam_manual_task_concluir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_manual_task_concluir(uuid, text) TO authenticated;

-- Novo pedido automático permitido: teste de conexões
CREATE OR REPLACE FUNCTION public.agent_refresh_request(p_task text, p_min_interval_min integer DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last timestamptz; v_open boolean; v_id uuid; v_op text;
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres','service_role') THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('sync-entra-groups','sync-entra-apps','sync-entra-licencas','sync-entra-roles',
    'sync-sharepoint-sites','sync-app-profiles','quarantine-triage','audit-reconciliation','test-app-connection') THEN
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
END $$;

-- Revisões por aplicação vão para o revisor (ou dono)
CREATE OR REPLACE FUNCTION public.aplicacao_responsavel_revisao(p_aplicacao_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(r.email, o.email, a.owner)
    FROM aplicacoes a LEFT JOIN colaboradores r ON r.id = a.revisor_colaborador_id LEFT JOIN colaboradores o ON o.id = a.owner_colaborador_id
   WHERE a.id = p_aplicacao_id
$$;
GRANT EXECUTE ON FUNCTION public.aplicacao_responsavel_revisao(uuid) TO authenticated, service_role;