-- =============================================================================
-- Teste de fumaça da lógica IGA (RPCs, máquina de estados, acesso efetivo,
-- cadastro manual, reset de senha, exceções, terceiros, dashboard, revisões) — 21 cenários.
-- Roda inteiro numa transação e faz ROLLBACK no fim — não deixa rastro.
--
--   docker exec -i supabase_db_jobopjhhxgcfanlhzlkc psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < db/tests/iga_smoke.sql
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;

-- ─── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO entra_grupos (id, entra_id, nome, on_premises_sync) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'g1', 'Grupo G1', false),
  ('a0000000-0000-4000-8000-000000000002', 'g2', 'Grupo G2', false),
  ('a0000000-0000-4000-8000-000000000003', 'g3', 'Grupo G3 (on-prem)', true);
INSERT INTO entra_licencas (id, sku_id, nome) VALUES ('b0000000-0000-4000-8000-000000000001', 'l1', 'Licença L1');
INSERT INTO aplicacoes (id, nome, entra_id) VALUES ('c0000000-0000-4000-8000-000000000001', 'App A1', 'a1');
INSERT INTO sharepoint_sites (id, site_id, nome, url) VALUES ('d0000000-0000-4000-8000-000000000001', 's1', 'Site S1', 'https://sp/s1');
INSERT INTO sharepoint_pastas (id, site_db_id, drive_item_id, nome, caminho) VALUES ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'p1', 'Pasta P1', '/P1');
INSERT INTO perfis_acesso (id, nome, tipo, ativo) VALUES
  ('e0000000-0000-4000-8000-00000000000a', 'Perfil A', 'funcional', true),
  ('e0000000-0000-4000-8000-00000000000b', 'Perfil B', 'funcional', true),
  ('e0000000-0000-4000-8000-00000000000c', 'Perfil C onprem', 'funcional', true);
INSERT INTO perfil_grupos (perfil_id, grupo_id) VALUES
  ('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000003');
INSERT INTO perfil_licencas (perfil_id, licenca_id) VALUES ('e0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001');
INSERT INTO perfil_aplicacoes (perfil_id, aplicacao_id) VALUES ('e0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000001');
INSERT INTO perfil_sharepoint (perfil_id, site_id, pasta_nivel1_id, permissao) VALUES
  ('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'leitura');
INSERT INTO cargos (id, nome) VALUES ('f0000000-0000-4000-8000-000000000001', 'Cargo Antigo'), ('f0000000-0000-4000-8000-000000000002', 'Cargo Novo');
INSERT INTO cargo_perfis (cargo_id, perfil_id) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b');
INSERT INTO colaboradores (id, nome, email, sam_account_name, status, cargo_id, origem) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Xavier Teste', 'xavier@origo.test', 'xavier', 'ativo', 'f0000000-0000-4000-8000-000000000001', 'manual');
INSERT INTO perfil_atribuicoes (perfil_id, colaborador_id, origem, ativo) VALUES
  ('e0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', 'cargo', true);
INSERT INTO terceiros (id, nome, email, ativo, empresa_terceira) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Tércio Teste', 'tercio@parceiro.test', true, 'Parceiro');
INSERT INTO perfil_atribuicoes (perfil_id, terceiro_id, origem, ativo) VALUES
  ('e0000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000001', 'manual', true);
-- gate global de aprovação desligado para o teste (tudo nasce pending, salvo o que é forçado)
UPDATE parametros SET valor = 'false' WHERE chave = 'iam_approval_required';
UPDATE parametros SET valor = 'aprovacao' WHERE chave = 'mover_remocao_modo';
UPDATE parametros SET valor = 'true' WHERE chave = 'iam_enable_requires_approval';

-- ─── T1: recursos de um perfil ───────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM iam_profile_resources(ARRAY['e0000000-0000-4000-8000-00000000000a'::uuid]);
  ASSERT n = 3, format('T1: esperado 3 recursos do Perfil A, obtido %s', n);
  RAISE NOTICE 'T1 ok';
END $$;

-- ─── T2: mover (cargo antigo → novo) remove só o exclusivo, com aprovação ─────
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := jml_alterar_cargo('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'tester@origo.test', 'manual');
  ASSERT (r->>'ok')::boolean, 'T2: mover falhou ' || r::text;
  -- assign: g1 (idempotente), g2, a1
  SELECT count(*) INTO n FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type IN ('assign_group','assign_app') AND status='pending';
  ASSERT n = 3, format('T2: esperado 3 assigns pending, obtido %s', n);
  -- remove: só l1 e sharepoint (g1 continua concedido pelo Perfil B) e em waiting_approval
  SELECT count(*) INTO n FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type LIKE 'remove_%';
  ASSERT n = 2, format('T2: esperado 2 removes, obtido %s', n);
  ASSERT NOT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='remove_group'), 'T2: remove_group g1 não deveria existir (ainda concedido por B)';
  ASSERT (SELECT bool_and(status='waiting_approval') FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type LIKE 'remove_%'), 'T2: removes de mover devem aguardar aprovação';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE action_type='remove_sharepoint' AND payload_json->>'siteId'='s1' AND payload_json->>'driveItemId'='p1'), 'T2: remove_sharepoint com payload correto';
  ASSERT (SELECT count(*) FROM perfil_atribuicoes WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND ativo) = 1, 'T2: só o Perfil B deve estar ativo';
  ASSERT EXISTS (SELECT 1 FROM eventos_jml WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND tipo='mover' AND status='executado'), 'T2: evento mover';
  RAISE NOTICE 'T2 ok';
END $$;

-- ─── T3: aprovação — auto-aprovação bloqueada, aprovação normal grava approved_by ──
DO $$
DECLARE v_id uuid; ok boolean := false;
BEGIN
  -- item solicitado pelo próprio admin local
  INSERT INTO iam_queue (action_type, status, colaborador_id, requested_by, resource_key, payload_json)
  VALUES ('assign_group', 'waiting_approval', '10000000-0000-4000-8000-000000000001', 'admin@origo.local', 'grupo:self', '{"groupId":"self"}') RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  BEGIN
    UPDATE iam_queue SET status = 'pending' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'T3: auto-aprovação deveria falhar';
  -- item solicitado por outra pessoa → aprova e grava approved_by = uid logado
  UPDATE iam_queue SET requested_by = 'outro@origo.test' WHERE id = v_id;
  UPDATE iam_queue SET status = 'pending' WHERE id = v_id;
  ASSERT (SELECT approved_by FROM iam_queue WHERE id = v_id) = '11111111-1111-4111-8111-111111111111', 'T3: approved_by deve ser o usuário logado';
  ASSERT (SELECT approved_at FROM iam_queue WHERE id = v_id) IS NOT NULL, 'T3: approved_at';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T3 ok';
END $$;

-- ─── T4: claim/lease + complete ───────────────────────────────────────────────
DO $$
DECLARE c record; n int; ok boolean := false;
BEGIN
  SELECT count(*) INTO n FROM claim_iam_queue_items('agent-test', 5, 60, NULL);
  ASSERT n > 0, 'T4: claim deveria reservar itens';
  SELECT * INTO c FROM iam_queue WHERE claim_owner = 'agent-test' LIMIT 1;
  ASSERT c.status = 'processing' AND c.claim_token IS NOT NULL AND c.lease_expires_at > now(), 'T4: item reservado';
  -- token errado
  BEGIN
    PERFORM complete_iam_queue_item(c.id, 'token-errado', 'success');
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  ASSERT ok, 'T4: complete com token errado deve falhar';
  PERFORM complete_iam_queue_item(c.id, c.claim_token, 'success', 'ok', 'agent-test');
  ASSERT (SELECT status FROM iam_queue WHERE id = c.id) = 'success', 'T4: success';
  ASSERT (SELECT claim_token FROM iam_queue WHERE id = c.id) IS NULL, 'T4: claim liberado';
  -- lease expirada volta para pending no próximo claim
  UPDATE iam_queue SET lease_expires_at = now() - interval '1 minute' WHERE claim_owner = 'agent-test' AND status = 'processing';
  PERFORM count(*) FROM claim_iam_queue_items('agent-2', 1, 60, ARRAY['nao_existe']);
  ASSERT NOT EXISTS (SELECT 1 FROM iam_queue WHERE status='processing' AND lease_expires_at < now()), 'T4: leases expiradas liberadas';
  RAISE NOTICE 'T4 ok';
END $$;

-- ─── T5: leaver hard ─────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := jml_alterar_status('10000000-0000-4000-8000-000000000001', 'desligado', 'tester@origo.test', 'manual', 'Saiu da empresa');
  ASSERT (r->>'ok')::boolean, 'T5: ' || r::text;
  ASSERT (r->>'tipo_desativacao') = 'hard', 'T5: hard';
  ASSERT (SELECT status FROM colaboradores WHERE id='10000000-0000-4000-8000-000000000001') = 'desligado', 'T5: status';
  ASSERT (SELECT desligado_manual FROM colaboradores WHERE id='10000000-0000-4000-8000-000000000001'), 'T5: desligado_manual';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='disable' AND status IN ('pending','processing')), 'T5: disable AD';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='disable_entra' AND (payload_json->>'revokeSignInSessions')::boolean), 'T5: disable_entra com revoke';
  ASSERT (SELECT count(*) FROM perfil_atribuicoes WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND ativo) = 0, 'T5: perfis revogados';
  -- remoções de tudo do Perfil B (g1, g2, a1) — a1 e g2 já tinham assign pending; remove_* abertos
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='remove_group' AND payload_json->>'groupId'='g2'), 'T5: remove g2';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='remove_app' AND payload_json->>'appId'='a1'), 'T5: remove a1';
  ASSERT EXISTS (SELECT 1 FROM eventos_jml WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND tipo='leaver' AND dados_antes->>'tipo_desativacao'='hard'), 'T5: evento leaver';
  RAISE NOTICE 'T5 ok';
END $$;

-- ─── T6: reativação ──────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := jml_alterar_status('10000000-0000-4000-8000-000000000001', 'ativo', 'tester@origo.test', 'manual', 'Recontratado');
  ASSERT (r->>'ok')::boolean, 'T6: ' || r::text;
  ASSERT NOT (SELECT desligado_manual FROM colaboradores WHERE id='10000000-0000-4000-8000-000000000001'), 'T6: flag limpa';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND action_type='enable_entra' AND status='waiting_approval'), 'T6: enable_entra aguarda aprovação';
  ASSERT (SELECT count(*) FROM perfil_atribuicoes WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND ativo AND origem='cargo') = 1, 'T6: cargo reprovisionado';
  ASSERT EXISTS (SELECT 1 FROM eventos_jml WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND tipo='joiner'), 'T6: evento joiner';
  RAISE NOTICE 'T6 ok';
END $$;

-- ─── T7: transição inválida ──────────────────────────────────────────────────
DO $$
DECLARE ok boolean := false; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM iam_queue WHERE status = 'success' LIMIT 1;
  BEGIN
    UPDATE iam_queue SET status = 'pending' WHERE id = v_id;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'T7: success → pending deve ser bloqueado';
  RAISE NOTICE 'T7 ok';
END $$;

-- ─── T8: terceiro desligar/reativar ──────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := terceiro_alterar_status('20000000-0000-4000-8000-000000000001', false, 'sistema', 'auto_expiracao', 'Contrato encerrado');
  ASSERT (r->>'ok')::boolean, 'T8: ' || r::text;
  ASSERT NOT (SELECT ativo FROM terceiros WHERE id='20000000-0000-4000-8000-000000000001'), 'T8: inativo';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE terceiro_id='20000000-0000-4000-8000-000000000001' AND action_type='disable_entra'), 'T8: disable_entra terceiro';
  ASSERT (SELECT count(*) FROM iam_queue WHERE terceiro_id='20000000-0000-4000-8000-000000000001' AND action_type LIKE 'remove_%') = 3, 'T8: 3 remoções (g1, l1, sharepoint)';
  ASSERT EXISTS (SELECT 1 FROM alertas WHERE tipo='terceiro_expirado' AND ref_id='20000000-0000-4000-8000-000000000001'), 'T8: alerta expirado';
  r := terceiro_alterar_status('20000000-0000-4000-8000-000000000001', true, 'tester@origo.test', 'manual', 'Renovou');
  ASSERT (r->>'ok')::boolean, 'T8b: ' || r::text;
  ASSERT (r->>'perfisRestaurados')::int = 1, 'T8b: perfil restaurado';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE terceiro_id='20000000-0000-4000-8000-000000000001' AND action_type='enable_entra' AND status='waiting_approval'), 'T8b: enable aguarda aprovação';
  RAISE NOTICE 'T8 ok';
END $$;

-- ─── T9: grupo on-prem nasce como failed/on_premises_managed ──────────────────
DO $$
DECLARE n int;
BEGIN
  INSERT INTO perfil_atribuicoes (perfil_id, colaborador_id, origem, ativo) VALUES ('e0000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000001', 'manual', true);
  n := iam_enqueue_profile_actions('10000000-0000-4000-8000-000000000001', NULL, ARRAY['e0000000-0000-4000-8000-00000000000c'::uuid], 'assign', 'tester', 'pending', 'teste');
  ASSERT n = 1, format('T9: 1 item, obtido %s', n);
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id='10000000-0000-4000-8000-000000000001' AND payload_json->>'groupId'='g3' AND status='failed' AND error_code='on_premises_managed'), 'T9: on-prem failed';
  RAISE NOTICE 'T9 ok';
END $$;

-- ─── T10: idempotência (índice único de item aberto) ──────────────────────────
DO $$
DECLARE n1 int; n2 int;
BEGIN
  n1 := iam_enqueue_resource_diff('10000000-0000-4000-8000-000000000001', NULL,
          '[{"tipo":"grupo","id":"a0000000-0000-4000-8000-000000000002"}]'::jsonb, '[]'::jsonb, 'manual_individual', 'pending');
  n2 := iam_enqueue_resource_diff('10000000-0000-4000-8000-000000000001', NULL,
          '[{"tipo":"grupo","id":"a0000000-0000-4000-8000-000000000002"}]'::jsonb, '[]'::jsonb, 'manual_individual', 'pending');
  ASSERT n2 = 0, format('T10: segundo enfileiramento deveria ser ignorado (n1=%s n2=%s)', n1, n2);
  RAISE NOTICE 'T10 ok';
END $$;

-- ─── T11: remoção individual respeita perfil que ainda concede ────────────────
DO $$
DECLARE n int;
BEGIN
  -- g1 é concedido pelo Perfil B (cargo novo, ativo) → remover "individualmente" g1 não gera item
  n := iam_enqueue_resource_diff('10000000-0000-4000-8000-000000000001', NULL,
          '[]'::jsonb, '[{"tipo":"grupo","id":"a0000000-0000-4000-8000-000000000001"}]'::jsonb, 'manual_individual', 'pending');
  ASSERT n = 0, format('T11: g1 ainda concedido pelo Perfil B, obtido %s', n);
  RAISE NOTICE 'T11 ok';
END $$;

-- ─── T12: exceção manter_ativo bloqueia desligamento ──────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO excecoes (solicitante, colaborador_nome, colaborador_id, tipo_excecao, justificativa, status, validade)
  VALUES ('gestor', 'Xavier Teste', '10000000-0000-4000-8000-000000000001', 'manter_ativo', 'projeto crítico', 'aprovada', current_date + 30);
  r := jml_alterar_status('10000000-0000-4000-8000-000000000001', 'desligado', 'importacao_csv', 'importacao_csv');
  ASSERT NOT (r->>'ok')::boolean AND (r->>'blocked')::boolean, 'T12: deveria bloquear: ' || r::text;
  ASSERT (SELECT status FROM colaboradores WHERE id='10000000-0000-4000-8000-000000000001') = 'ativo', 'T12: status preservado';
  RAISE NOTICE 'T12 ok';
END $$;

-- ─── T13: colaborador_salvar (criação manual): conta AD + acessos do cargo com carência ──
DO $$
DECLARE r jsonb; v_id uuid; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  r := colaborador_salvar(NULL, '{"nome":"Nova Pessoa","email":"nova.pessoa@origo.test","sam_account_name":"nova.pessoa","status":"ativo","cargo_id":"f0000000-0000-4000-8000-000000000002"}'::jsonb, 'admin@origo.local');
  ASSERT (r->>'ok')::boolean, 'T13: ' || r::text;
  v_id := (r->>'id')::uuid;
  ASSERT (SELECT cargo_id FROM colaboradores WHERE id = v_id) = 'f0000000-0000-4000-8000-000000000002', 'T13: cargo gravado';
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id = v_id AND action_type = 'create' AND payload_json->>'userPrincipalName' LIKE 'nova.pessoa@%' AND NOT (payload_json ? 'password')), 'T13: create AD sem senha no payload';
  SELECT count(*) INTO n FROM iam_queue WHERE colaborador_id = v_id AND action_type LIKE 'assign\_%' AND next_retry_at > now();
  ASSERT n = 3, format('T13: assigns do cargo com carência de replicação, obtido %s', n);
  ASSERT (SELECT count(*) FROM eventos_jml WHERE colaborador_id = v_id AND tipo = 'joiner') = 1, 'T13: 1 evento joiner';
  ASSERT NOT EXISTS (SELECT 1 FROM eventos_jml WHERE colaborador_id = v_id AND tipo = 'mover'), 'T13: criação não gera mover';
  -- edição: e-mail duplicado é recusado; mudança de área enfileira update AD + update_entra
  r := colaborador_salvar(v_id, '{"nome":"Nova Pessoa","email":"xavier@origo.test","sam_account_name":"nova.pessoa","status":"ativo","cargo_id":"f0000000-0000-4000-8000-000000000002"}'::jsonb, 'admin@origo.local');
  ASSERT NOT (r->>'ok')::boolean, 'T13: e-mail duplicado deveria falhar';
  INSERT INTO empresas (id, nome) VALUES ('f0000000-0000-4000-8000-0000000000e1', 'Empresa X');
  INSERT INTO areas (id, nome, empresa_id) VALUES ('f0000000-0000-4000-8000-0000000000a1', 'Area X', 'f0000000-0000-4000-8000-0000000000e1');
  r := colaborador_salvar(v_id, '{"nome":"Nova Pessoa","email":"nova.pessoa@origo.test","sam_account_name":"nova.pessoa","status":"ativo","cargo_id":"f0000000-0000-4000-8000-000000000002","area_id":"f0000000-0000-4000-8000-0000000000a1"}'::jsonb, 'admin@origo.local');
  ASSERT (r->>'ok')::boolean AND (r->>'atributos_enfileirados')::boolean, 'T13: edição de área ' || r::text;
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE colaborador_id = v_id AND action_type = 'update_entra' AND payload_json->>'department' = 'Area X'), 'T13: update_entra department';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T13 ok';
END $$;

-- ─── T14: reset de senha vira item da fila; sem duplicar ─────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  r := iam_enqueue_reset_password('10000000-0000-4000-8000-000000000001', NULL, 'GLPI #1');
  ASSERT (r->>'ok')::boolean, 'T14: ' || r::text;
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE id = (r->>'item_id')::uuid AND action_type = 'reset_password' AND requested_by = 'admin@origo.local' AND payload_json->>'deliver_to' = 'admin@origo.local'), 'T14: item com deliver_to';
  r := iam_enqueue_reset_password('10000000-0000-4000-8000-000000000001', NULL, 'GLPI #1 de novo');
  ASSERT NOT (r->>'ok')::boolean, 'T14: reset duplicado deveria ser recusado';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T14 ok';
END $$;

-- ─── T15: exceção — decisão transacional, anti-auto-aprovação, provisiona pelo acesso efetivo ──
DO $$
DECLARE v_ex uuid; r jsonb;
BEGIN
  INSERT INTO excecoes (solicitante, colaborador_nome, colaborador_id, perfil_id, perfil_solicitado, tipo_excecao, justificativa, status, validade)
  VALUES ('admin@origo.local', 'Xavier Teste', '10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 'Perfil A', 'acesso', 'teste', 'pendente', current_date + 10)
  RETURNING id INTO v_ex;
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  r := excecao_decidir(v_ex, 'aprovada', 'ok');
  ASSERT NOT (r->>'ok')::boolean, 'T15: auto-aprovação deveria ser recusada: ' || r::text;
  UPDATE excecoes SET solicitante = 'outra.pessoa@origo.test' WHERE id = v_ex;
  r := excecao_decidir(v_ex, 'aprovada', 'ok');
  ASSERT (r->>'ok')::boolean, 'T15: ' || r::text;
  ASSERT (SELECT status FROM excecoes WHERE id = v_ex) = 'aprovada', 'T15: status';
  ASSERT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE colaborador_id = '10000000-0000-4000-8000-000000000001' AND perfil_id = 'e0000000-0000-4000-8000-00000000000a' AND ativo AND origem = 'excecao'), 'T15: atribuição por exceção';
  r := excecao_decidir(v_ex, 'aprovada', 'ok');
  ASSERT NOT (r->>'ok')::boolean, 'T15: decidir duas vezes deve falhar';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T15 ok';
END $$;

-- ─── T16: terceiro_salvar + trigger de exclusão vira desligamento ─────────────
DO $$
DECLARE r jsonb; v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  r := terceiro_salvar(NULL, '{"nome":"Terceiro Novo","email":"terceiro.novo_parceiro@parceiro.test","sam_account_name":"terceiro.novo_parceiro","empresa_terceira":"Parceiro","contrato_fim":"2030-01-01","ativo":true}'::jsonb, 'admin@origo.local');
  ASSERT (r->>'ok')::boolean, 'T16: ' || r::text;
  v_id := (r->>'id')::uuid;
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE terceiro_id = v_id AND action_type = 'create' AND payload_json->>'accountExpires' = '2030-01-01'), 'T16: create AD com accountExpires';
  ASSERT EXISTS (SELECT 1 FROM eventos_jml WHERE terceiro_id = v_id AND tipo = 'joiner'), 'T16: evento joiner com terceiro_id';
  DELETE FROM terceiros WHERE id = v_id;
  ASSERT EXISTS (SELECT 1 FROM terceiros WHERE id = v_id AND ativo = false), 'T16: delete convertido em desligamento';
  ASSERT EXISTS (SELECT 1 FROM eventos_jml WHERE terceiro_id = v_id AND tipo = 'leaver'), 'T16: evento leaver preenchido pelo trigger';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T16 ok';
END $$;

-- ─── T17: métricas do dashboard e stats da fila respondem em uma chamada ──────
DO $$
DECLARE m jsonb; q jsonb; sr jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  m := dashboard_metrics();
  ASSERT (m->>'colab_total')::int >= 2 AND m ? 'fila_pending' AND m ? 'agente' AND m ? 'sod_violacoes', 'T17: dashboard_metrics incompleto: ' || left(m::text, 200);
  q := iam_queue_stats();
  ASSERT (q->>'total')::int > 0, 'T17: iam_queue_stats';
  sr := dashboard_series(7);
  ASSERT jsonb_array_length(sr) = 7, 'T17: dashboard_series deve ter 7 dias';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T17 ok';
END $$;

-- ─── T18: heartbeat do agente e opções de teste removidas ─────────────────────
DO $$
BEGIN
  PERFORM iam_agent_heartbeat('agente-teste', 'claim', '{"version":"2.0.0","host":"h1","execute":true}'::jsonb);
  PERFORM iam_agent_heartbeat('agente-teste', 'result', '{"result":"assign_group: success"}'::jsonb);
  ASSERT (SELECT last_result FROM iam_agent_status WHERE owner = 'agente-teste') = 'assign_group: success', 'T18: heartbeat';
  ASSERT (SELECT version FROM iam_agent_status WHERE owner = 'agente-teste') = '2.0.0', 'T18: versão preservada';
  ASSERT NOT EXISTS (SELECT 1 FROM parametros WHERE chave IN ('modo_operacao','iam_execution_mode','importacao_automatica')), 'T18: parâmetros de teste removidos';
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'origo-process-queue'), 'T18: job do executor Lovable removido';
  ASSERT to_regclass('public.evento_jml_acoes') IS NULL, 'T18: tabela morta removida';
  RAISE NOTICE 'T18 ok';
END $$;

-- ─── T19: revisão por aplicação — itens, decisão e conclusão com revogação PRÉ-APROVADA ──
DO $$
DECLARE r jsonb; v_rev uuid; v_item uuid; v_before int; n int; v_q record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  UPDATE parametros SET valor = 'true' WHERE chave = 'iam_approval_required';   -- gate ligado: revogação de revisão não pode esperar aprovação
  UPDATE aplicacoes SET owner = 'Maria Owner <maria.owner@origo.test>' WHERE id = 'c0000000-0000-4000-8000-000000000001';
  -- Xavier tem Perfil B (App A1) pelo cargo novo
  r := revisao_criar('aplicacao', 'c0000000-0000-4000-8000-000000000001', NULL, current_date + 7, NULL, 'admin@origo.local');
  ASSERT (r->>'ok')::boolean AND NOT (r->>'existente')::boolean, 'T19: ' || r::text;
  v_rev := (r->>'id')::uuid;
  ASSERT (r->>'owner_email') = 'maria.owner@origo.test', 'T19: owner e-mail resolvido de "Nome <email>", obtido ' || COALESCE(r->>'owner_email','null');
  SELECT count(*) INTO n FROM revisao_itens WHERE revisao_id = v_rev AND tipo = 'perfil' AND colaborador_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 1, format('T19: esperado 1 item de perfil para Xavier, obtido %s', n);
  ASSERT (SELECT total_itens FROM revisoes WHERE id = v_rev) >= 1, 'T19: total_itens pelo trigger';
  r := revisao_criar('aplicacao', 'c0000000-0000-4000-8000-000000000001', NULL, NULL, NULL, 'admin@origo.local');
  ASSERT (r->>'existente')::boolean, 'T19: segunda campanha da mesma app deve reaproveitar a aberta';

  SELECT id INTO v_item FROM revisao_itens WHERE revisao_id = v_rev AND colaborador_id = '10000000-0000-4000-8000-000000000001' AND tipo = 'perfil';
  r := revisao_decidir_itens(v_rev, jsonb_build_object(v_item::text, 'revogar'), jsonb_build_object(v_item::text, 'não usa mais'), 'maria.owner@origo.test');
  ASSERT (r->>'decididos')::int = 1, 'T19: decisão ' || r::text;
  ASSERT (SELECT itens_revisados FROM revisoes WHERE id = v_rev) = 1, 'T19: progresso pelo trigger';
  ASSERT (SELECT decidido_por FROM revisao_itens WHERE id = v_item) = 'maria.owner@origo.test', 'T19: decidido_por';

  -- limpa itens abertos de cenários anteriores (índice único de item aberto por recurso)
  UPDATE iam_queue SET status = 'cancelled' WHERE colaborador_id = '10000000-0000-4000-8000-000000000001' AND status IN ('pending','waiting_approval');
  SELECT count(*) INTO v_before FROM iam_queue WHERE colaborador_id = '10000000-0000-4000-8000-000000000001' AND action_type LIKE 'remove\_%';
  r := revisao_concluir(v_rev, 'maria.owner@origo.test');
  ASSERT (r->>'ok')::boolean AND (r->>'revogados')::int = 1, 'T19: concluir ' || r::text;
  ASSERT (SELECT status::text FROM revisoes WHERE id = v_rev) = 'concluida', 'T19: status concluida';
  ASSERT NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE colaborador_id = '10000000-0000-4000-8000-000000000001' AND perfil_id = 'e0000000-0000-4000-8000-00000000000b' AND ativo), 'T19: atribuição revogada';
  -- as remoções nasceram pending + approved_at (pré-aprovadas), mesmo com o gate ligado
  FOR v_q IN SELECT * FROM iam_queue WHERE requested_by = 'revisao:' || v_rev::text LOOP
    ASSERT v_q.status = 'pending', format('T19: item %s deveria estar pending (pré-aprovado), está %s', v_q.action_type, v_q.status);
    ASSERT v_q.approved_at IS NOT NULL AND v_q.payload_json->'aprovacao'->>'origem' = 'revisao', 'T19: marca de pré-aprovação';
  END LOOP;
  ASSERT (SELECT count(*) FROM iam_queue WHERE requested_by = 'revisao:' || v_rev::text) > 0, 'T19: remoções enfileiradas';
  -- flag limpo: um item comum volta a cair no gate
  INSERT INTO iam_queue (action_type, status, target_identity, requested_by, resource_key, payload_json) VALUES ('assign_group','pending','x@y','teste','grupo:gate-check','{"groupId":"gate-check"}');
  ASSERT (SELECT status FROM iam_queue WHERE resource_key = 'grupo:gate-check') = 'waiting_approval', 'T19: gate continua valendo para itens comuns';
  r := revisao_concluir(v_rev, 'maria.owner@origo.test');
  ASSERT NOT (r->>'ok')::boolean, 'T19: concluir duas vezes deve falhar';
  UPDATE parametros SET valor = 'false' WHERE chave = 'iam_approval_required';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T19 ok';
END $$;

-- ─── T20: revisão por gestor + campanhas em lote + inbox do Hermes ───────────
DO $$
DECLARE r jsonb; v_g uuid; n int; inbox jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  INSERT INTO colaboradores (id, nome, email, status, origem) VALUES ('10000000-0000-4000-8000-000000000009', 'Gestora Teste', 'gestora@origo.test', 'ativo', 'manual') RETURNING id INTO v_g;
  UPDATE colaboradores SET gestor_id = v_g WHERE id = '10000000-0000-4000-8000-000000000001';
  r := revisao_criar_por_gestores(current_date + 14, 'admin@origo.local');
  ASSERT (r->>'criadas')::int = 1, 'T20: ' || r::text;
  SELECT count(*) INTO n FROM revisao_itens ri JOIN revisoes rv ON rv.id = ri.revisao_id WHERE rv.gestor_id = v_g;
  ASSERT n >= 1, format('T20: itens da equipe, obtido %s', n);
  ASSERT (SELECT owner_email FROM revisoes WHERE gestor_id = v_g) = 'gestora@origo.test', 'T20: e-mail do gestor';
  inbox := hermes_inbox();
  ASSERT jsonb_array_length(inbox->'revisoes_abertas') >= 1 AND inbox ? 'fila' AND inbox ? 'agente', 'T20: inbox ' || left(inbox::text, 200);
  r := revisao_cancelar((SELECT id FROM revisoes WHERE gestor_id = v_g), 'teste');
  ASSERT (r->>'ok')::boolean, 'T20: cancelar ' || r::text;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T20 ok';
END $$;

-- ─── T21: quarentena, revalidação de terceiro e alertas via RPC ───────────────
DO $$
DECLARE r jsonb; v_q uuid; n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  INSERT INTO sync_jobs (id, tipo, status) VALUES ('30000000-0000-4000-8000-000000000001', 'csv_colab', 'done');
  INSERT INTO colab_quarentena (import_job_id, motivo, status, nome, matricula) VALUES ('30000000-0000-4000-8000-000000000001', 'sem_matricula', 'pendente', 'Fulana', NULL) RETURNING id INTO v_q;
  r := quarentena_decidir(v_q, 'resolvido', 'RH corrigiu');
  ASSERT (r->>'ok')::boolean AND (SELECT status FROM colab_quarentena WHERE id = v_q) = 'resolvido', 'T21: quarentena ' || r::text;
  r := terceiro_revalidar('20000000-0000-4000-8000-000000000001', current_date + 90, 'contrato renovado');
  ASSERT (r->>'ok')::boolean AND (SELECT contrato_fim FROM terceiros WHERE id = '20000000-0000-4000-8000-000000000001') = current_date + 90, 'T21: revalidar ' || r::text;
  n := alertas_marcar_lidos(NULL);
  ASSERT (SELECT count(*) FROM alertas WHERE NOT lido) = 0, 'T21: alertas lidos';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T21 ok';
END $$;

-- ─── T22: revalidação de terceiros por responsável (campanha) + prazo expirado ─
DO $$
DECLARE r jsonb; v_rev uuid; v_resp uuid := '10000000-0000-4000-8000-0000000000c1'; v_t1 uuid; v_t2 uuid; v_item1 uuid; v_item2 uuid; v_before int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"admin@origo.local"}', true);
  UPDATE parametros SET valor = 'true' WHERE chave = 'iam_approval_required';
  INSERT INTO colaboradores (id, nome, email, matricula, status, empresa_id, origem, sam_account_name)
  VALUES (v_resp, 'Responsável Terceiros', 'resp.terceiros@origo.local', 'R001', 'ativo', 'a0000000-0000-0000-0000-000000000001', 'manual', 'resp.terceiros');
  INSERT INTO terceiros (nome, email, sam_account_name, ativo, empresa_terceira, contrato_fim, responsavel_colaborador_id, ultima_revalidacao)
  VALUES ('Terc Um', 'terc.um@parceiro.test', 'terc.um', true, 'Parceiro', current_date + 200, v_resp, current_date - 100) RETURNING id INTO v_t1;
  INSERT INTO terceiros (nome, email, sam_account_name, ativo, empresa_terceira, contrato_fim, responsavel_colaborador_id, ultima_revalidacao)
  VALUES ('Terc Dois', 'terc.dois@parceiro.test', 'terc.dois', true, 'Parceiro', current_date + 200, v_resp, current_date - 100) RETURNING id INTO v_t2;
  INSERT INTO perfil_atribuicoes (perfil_id, terceiro_id, origem, ativo) VALUES ('e0000000-0000-4000-8000-00000000000a', v_t2, 'manual', true);
  -- trigger de auditoria da atribuição
  ASSERT EXISTS (SELECT 1 FROM auditoria WHERE entidade = 'perfil_atribuicoes' AND acao = 'atribuir_perfil' AND detalhes->>'pessoa_id' = v_t2::text), 'T22: auditoria da atribuição';

  -- ciclo: uma campanha por responsável com terceiros vencidos
  r := revisao_criar_por_responsaveis(NULL, 'sistema', true);
  ASSERT (r->>'criadas')::int >= 1, 'T22: campanha criada ' || r::text;
  SELECT id INTO v_rev FROM revisoes WHERE tipo = 'terceiros' AND gestor_id = v_resp AND status = 'em_andamento';
  ASSERT v_rev IS NOT NULL, 'T22: campanha do responsável';
  ASSERT (SELECT owner_email FROM revisoes WHERE id = v_rev) = 'resp.terceiros@origo.local', 'T22: e-mail do responsável';
  ASSERT (SELECT data_fim FROM revisoes WHERE id = v_rev) = current_date + 7, 'T22: prazo = terceiro_revalidacao_prazo_dias';
  ASSERT (SELECT count(*) FROM revisao_itens WHERE revisao_id = v_rev AND tipo = 'terceiro') = 2, 'T22: 2 terceiros na campanha';
  r := revisao_criar_por_responsaveis(NULL, 'sistema', true);
  ASSERT (r->>'existentes')::int >= 1 AND (r->>'criadas')::int = 0, 'T22: não duplica ' || r::text;

  -- responsável mantém o primeiro; o segundo fica sem resposta e o prazo expira
  SELECT id INTO v_item1 FROM revisao_itens WHERE revisao_id = v_rev AND terceiro_id = v_t1;
  SELECT id INTO v_item2 FROM revisao_itens WHERE revisao_id = v_rev AND terceiro_id = v_t2;
  r := revisao_decidir_itens(v_rev, jsonb_build_object(v_item1::text, 'manter'), '{}'::jsonb, 'resp.terceiros@origo.local');
  ASSERT (r->>'decididos')::int = 1, 'T22: decisão ' || r::text;
  SELECT count(*) INTO v_before FROM iam_queue WHERE terceiro_id = v_t2;
  r := revisao_concluir(v_rev, 'sistema', 'revogar');
  ASSERT (r->>'ok')::boolean AND (r->>'mantidos')::int = 1 AND (r->>'revogados')::int = 1 AND (r->>'automaticos')::int = 1, 'T22: conclusão ' || r::text;
  ASSERT (SELECT ultima_revalidacao FROM terceiros WHERE id = v_t1) = current_date, 'T22: Terc Um revalidado';
  ASSERT NOT (SELECT ativo FROM terceiros WHERE id = v_t2), 'T22: Terc Dois desativado por prazo';
  ASSERT (SELECT decidido_por FROM revisao_itens WHERE id = v_item2) = 'sistema (prazo expirado)', 'T22: decisão automática registrada';
  -- desligamento nasce aprovado (gate ligado) e vai para o agente
  ASSERT EXISTS (SELECT 1 FROM iam_queue WHERE terceiro_id = v_t2 AND action_type = 'disable_entra' AND status = 'pending' AND approved_at IS NOT NULL AND payload_json->'aprovacao'->>'origem' = 'revisao'), 'T22: disable pré-aprovado';
  ASSERT (SELECT count(*) FROM iam_queue WHERE terceiro_id = v_t2) > v_before, 'T22: remoções enfileiradas';
  ASSERT (SELECT status FROM revisoes WHERE id = v_rev) = 'concluida', 'T22: campanha concluída';
  -- feed unificado
  ASSERT jsonb_array_length(dashboard_activity(20, 'acesso')) > 0 AND jsonb_array_length(dashboard_activity(20, 'pessoa')) > 0, 'T22: dashboard_activity';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(dashboard_activity(200, 'pessoa')) x WHERE x->>'acao' = 'desligar_terceiro'), 'T22: desligamento no feed';
  UPDATE parametros SET valor = 'false' WHERE chave = 'iam_approval_required';
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'T22 ok';
END $$;

SELECT 'TODOS OS TESTES PASSARAM' AS resultado;
ROLLBACK;
