-- =============================================================================
-- Órigo Access & Identity — migrations pendentes para produção (gerado por scripts/build-deploy-sql.mjs)
-- Gerado em 2026-09-17T21:09:28.165Z — 14 arquivo(s)
-- Todas são idempotentes: podem ser reaplicadas em caso de falha parcial.
-- Cole no SQL editor do Lovable Cloud e execute de uma vez.
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>>> 20260806141300_reconstruct_manual_objects.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- RECONSTRUÇÃO DE OBJETOS CRIADOS MANUALMENTE EM PRODUÇÃO
-- =============================================================================
-- As tabelas abaixo existem em produção mas foram criadas fora das migrations
-- (via SQL editor do Lovable Cloud). A migration 20260806141309 depende delas,
-- então um ambiente novo (supabase start / db reset) falhava.
--
-- Tudo aqui é IF NOT EXISTS: em produção é no-op; localmente cria o mínimo
-- necessário para o histórico de migrations aplicar do zero.
--
-- Estruturas de iam_restore_guardrails e iam_change_backups foram derivadas de
-- src/integrations/supabase/types.ts. As tabelas backup_* foram criadas em
-- produção como cópias (CREATE TABLE ... AS SELECT) e aqui são recriadas com
-- a estrutura da tabela de origem, sem dados.
--
-- TODO: substituir pelas definições reais após um `pg_dump --schema-only`
--       do banco de produção.
-- =============================================================================

-- Chave de guardrail (singleton: id = true)
CREATE TABLE IF NOT EXISTS public.iam_restore_guardrails (
  id          boolean     PRIMARY KEY DEFAULT true CHECK (id = true),
  active      boolean     NOT NULL DEFAULT false,
  reason      text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Backups de alterações feitas por triggers (SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.iam_change_backups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      text        NOT NULL,
  operation       text        NOT NULL,
  record_id       text,
  old_data        jsonb,
  new_data        jsonb,
  actor           text,
  source          text        NOT NULL DEFAULT 'trigger',
  reason          text,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
ALTER TABLE public.iam_change_backups ENABLE ROW LEVEL SECURITY;

-- Snapshots pontuais feitos em 2026-07-07/08 (somente estrutura)
CREATE TABLE IF NOT EXISTS public.backup_cargo_perfis_20260708
  AS SELECT * FROM public.cargo_perfis WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.backup_cargo_perfis_regex_fix_20260708
  AS SELECT * FROM public.cargo_perfis WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.backup_colaboradores_restore_20260707
  AS SELECT * FROM public.colaboradores WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.backup_perfil_atribuicoes_20260708
  AS SELECT * FROM public.perfil_atribuicoes WITH NO DATA;
CREATE TABLE IF NOT EXISTS public.backup_perfil_licencas_20260708
  AS SELECT * FROM public.perfil_licencas WITH NO DATA;

-- Coluna de carimbo presente nos snapshots de produção
ALTER TABLE public.backup_cargo_perfis_20260708           ADD COLUMN IF NOT EXISTS backup_created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.backup_cargo_perfis_regex_fix_20260708 ADD COLUMN IF NOT EXISTS backup_created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.backup_perfil_atribuicoes_20260708     ADD COLUMN IF NOT EXISTS backup_created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.backup_perfil_licencas_20260708        ADD COLUMN IF NOT EXISTS backup_created_at timestamptz NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- Claim/lease transacional da fila IAM (docs/iam-agent-orchestrated-mode.md,
-- "Próximas etapas" #1). Colunas e funções existem em produção e em types.ts,
-- mas não em nenhuma migration. Nenhum código do repositório as usa ainda.
-- -----------------------------------------------------------------------------
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS claim_owner      text;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS claim_token      text;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS claimed_at       timestamptz;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS claim_attempts   integer NOT NULL DEFAULT 0;

-- Funções: criadas SOMENTE se não existirem (jamais sobrescrever as de produção).
DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_iam_queue_items'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.claim_iam_queue_items(
        p_owner         text,
        p_limit         integer DEFAULT 10,
        p_lease_seconds integer DEFAULT 300,
        p_action_types  text[]  DEFAULT NULL
      )
      RETURNS SETOF public.iam_queue
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        v_token text := gen_random_uuid()::text;
      BEGIN
        RETURN QUERY
        WITH candidatos AS (
          SELECT q.id
          FROM public.iam_queue q
          WHERE q.status = 'pending'
            AND (p_action_types IS NULL OR q.action_type = ANY (p_action_types))
            AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
            AND (q.lease_expires_at IS NULL OR q.lease_expires_at < now())
          ORDER BY q.created_at
          LIMIT GREATEST(p_limit, 1)
          FOR UPDATE SKIP LOCKED
        )
        UPDATE public.iam_queue q
        SET status           = 'processing',
            claim_owner      = p_owner,
            claim_token      = v_token,
            claimed_at       = now(),
            lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
            claim_attempts   = COALESCE(q.claim_attempts, 0) + 1
        FROM candidatos c
        WHERE q.id = c.id
        RETURNING q.*;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) TO authenticated, service_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'complete_iam_queue_item'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.complete_iam_queue_item(
        p_id             uuid,
        p_claim_token    text,
        p_status         text,
        p_result_message text DEFAULT NULL,
        p_processed_by   text DEFAULT NULL,
        p_error_code     text DEFAULT NULL
      )
      RETURNS public.iam_queue
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        v_row public.iam_queue;
      BEGIN
        UPDATE public.iam_queue q
        SET status           = p_status,
            result_message   = COALESCE(p_result_message, q.result_message),
            processed_by     = COALESCE(p_processed_by, q.claim_owner, q.processed_by),
            error_code       = p_error_code,
            processed_at     = now(),
            claim_token      = NULL,
            lease_expires_at = NULL
        WHERE q.id = p_id
          AND q.claim_token = p_claim_token
        RETURNING q.* INTO v_row;

        IF v_row.id IS NULL THEN
          RAISE EXCEPTION 'iam_queue item % não encontrado ou claim_token inválido', p_id
            USING ERRCODE = 'P0002';
        END IF;
        RETURN v_row;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.complete_iam_queue_item(uuid, text, text, text, text, text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.complete_iam_queue_item(uuid, text, text, text, text, text) TO authenticated, service_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_iam_change_backups'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.cleanup_expired_iam_change_backups()
      RETURNS integer
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      DECLARE
        v_count integer;
      BEGIN
        DELETE FROM public.iam_change_backups WHERE expires_at < now();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RETURN v_count;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.cleanup_expired_iam_change_backups() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_expired_iam_change_backups() TO service_role';
  END IF;
END
$outer$;
-- <<<<<<<<<<<<<<<<<<<<<< 20260806141300_reconstruct_manual_objects.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120000_iga_queue_state_machine.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (1/7): integridade da fila IAM
--   • status com CHECK e máquina de estados (trigger)
--   • aprovação exige approved_by (= auth.uid()) e proíbe auto-aprovação
--   • claim/lease atômico (claim_iam_queue_items / complete_iam_queue_item)
--   • terceiro_id (a fila misturava ids de terceiros em colaborador_id)
--   • resource_key + índice único parcial: nunca dois itens abertos iguais
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS terceiro_id  uuid;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS resource_key text;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- ids de terceiros gravados em colaborador_id → terceiro_id
UPDATE public.iam_queue q
   SET terceiro_id = q.colaborador_id, colaborador_id = NULL
  FROM public.terceiros t
 WHERE q.colaborador_id = t.id
   AND NOT EXISTS (SELECT 1 FROM public.colaboradores c WHERE c.id = q.colaborador_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iam_queue_terceiro_id_fkey') THEN
    ALTER TABLE public.iam_queue
      ADD CONSTRAINT iam_queue_terceiro_id_fkey FOREIGN KEY (terceiro_id)
      REFERENCES public.terceiros(id) ON DELETE SET NULL NOT VALID;
  END IF;
  -- NOT VALID: não valida linhas antigas (há ids órfãos do bug de DELETE), só as novas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iam_queue_colaborador_id_fkey') THEN
    ALTER TABLE public.iam_queue
      ADD CONSTRAINT iam_queue_colaborador_id_fkey FOREIGN KEY (colaborador_id)
      REFERENCES public.colaboradores(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Vocabulário de status
-- ---------------------------------------------------------------------------
UPDATE public.iam_queue
   SET status = 'failed',
       error_code = COALESCE(error_code, 'status_invalido'),
       result_message = COALESCE(result_message, '') || ' [status original: ' || status || ']'
 WHERE status NOT IN ('pending','waiting_approval','processing','success','failed','cancelled','rejected');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iam_queue_status_check') THEN
    ALTER TABLE public.iam_queue ADD CONSTRAINT iam_queue_status_check
      CHECK (status IN ('pending','waiting_approval','processing','success','failed','cancelled','rejected'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Índice único parcial: um único item ABERTO por identidade × ação × recurso
--    (resource_key NULL fica fora — produtores legados continuam funcionando)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_iam_queue_open_resource
  ON public.iam_queue (COALESCE(colaborador_id, terceiro_id), action_type, resource_key)
  WHERE status IN ('pending','waiting_approval','processing') AND resource_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_iam_queue_terceiro ON public.iam_queue (terceiro_id) WHERE terceiro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_iam_queue_lease ON public.iam_queue (lease_expires_at) WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- 4. Máquina de estados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_validate_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_ok        boolean := false;
  v_req_email text;
  v_apr_email text;
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_ok := CASE OLD.status
    WHEN 'pending'          THEN NEW.status IN ('processing','success','failed','cancelled','waiting_approval','rejected')
    WHEN 'waiting_approval' THEN NEW.status IN ('pending','rejected','cancelled')
    WHEN 'processing'       THEN NEW.status IN ('success','failed','pending','cancelled')
    WHEN 'failed'           THEN NEW.status IN ('pending','cancelled')
    WHEN 'success'          THEN false
    WHEN 'cancelled'        THEN false
    WHEN 'rejected'         THEN false
    ELSE false END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transição inválida na fila IAM: % → % (item %)', OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Aprovação: waiting_approval → pending
  IF OLD.status = 'waiting_approval' AND NEW.status = 'pending' THEN
    IF v_uid IS NOT NULL THEN
      -- usuário autenticado: o aprovador é sempre quem está logado
      NEW.approved_by := v_uid;
    END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'Aprovação exige approved_by (item %)', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());

    SELECT lower(email) INTO v_apr_email FROM public.profiles WHERE id = NEW.approved_by;
    v_req_email := lower(COALESCE(OLD.requested_by, ''));
    IF v_apr_email IS NOT NULL AND v_req_email <> '' AND v_apr_email = v_req_email THEN
      RAISE EXCEPTION 'Auto-aprovação não permitida: % solicitou e tentou aprovar o item %', v_apr_email, OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    -- item aprovado volta limpo para execução
    NEW.retry_count   := 0;
    NEW.next_retry_at := NULL;
    NEW.rejection_reason := NULL;
  END IF;

  IF NEW.status = 'rejected' AND v_uid IS NOT NULL THEN
    NEW.approved_by := v_uid;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  -- Saindo de processing: libera a reserva
  IF OLD.status = 'processing' AND NEW.status <> 'processing' THEN
    NEW.claim_token      := NULL;
    NEW.lease_expires_at := NULL;
  END IF;

  IF NEW.status IN ('success','failed','cancelled','rejected') THEN
    NEW.processed_at := COALESCE(NEW.processed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iam_queue_validate_transition ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_validate_transition
  BEFORE UPDATE ON public.iam_queue
  FOR EACH ROW EXECUTE FUNCTION public.iam_queue_validate_transition();

-- ---------------------------------------------------------------------------
-- 5. Claim / lease (substitui as versões criadas manualmente em produção)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_iam_queue_items(
  p_owner         text,
  p_limit         integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300,
  p_action_types  text[]  DEFAULT NULL
)
RETURNS SETOF public.iam_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := gen_random_uuid()::text;
BEGIN
  -- Leases expiradas (executor morreu) voltam para pending antes de reservar
  UPDATE public.iam_queue
     SET status = 'pending',
         result_message = COALESCE(result_message,'') || ' [lease expirada de ' || COALESCE(claim_owner,'?') || ']'
   WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < now();

  RETURN QUERY
  WITH candidatos AS (
    SELECT q.id
      FROM public.iam_queue q
     WHERE q.status = 'pending'
       AND (p_action_types IS NULL OR q.action_type = ANY (p_action_types))
       AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
     ORDER BY q.created_at
     LIMIT GREATEST(COALESCE(p_limit, 10), 1)
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.iam_queue q
     SET status           = 'processing',
         claim_owner      = p_owner,
         claim_token      = v_token,
         claimed_at       = now(),
         lease_expires_at = now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 300), 30)),
         claim_attempts   = COALESCE(q.claim_attempts, 0) + 1
    FROM candidatos c
   WHERE q.id = c.id
  RETURNING q.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_iam_queue_item(
  p_id             uuid,
  p_claim_token    text,
  p_status         text,
  p_result_message text DEFAULT NULL,
  p_processed_by   text DEFAULT NULL,
  p_error_code     text DEFAULT NULL,
  p_next_retry_at  timestamptz DEFAULT NULL,
  p_retry_count    integer DEFAULT NULL,
  p_target_identity text DEFAULT NULL
)
RETURNS public.iam_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.iam_queue;
BEGIN
  IF p_status NOT IN ('success','failed','pending','cancelled') THEN
    RAISE EXCEPTION 'Status final inválido para complete_iam_queue_item: %', p_status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.iam_queue q
     SET status           = p_status,
         result_message   = COALESCE(p_result_message, q.result_message),
         processed_by     = COALESCE(p_processed_by, q.claim_owner, q.processed_by),
         error_code       = p_error_code,
         next_retry_at    = p_next_retry_at,
         retry_count      = COALESCE(p_retry_count, q.retry_count),
         target_identity  = COALESCE(p_target_identity, q.target_identity),
         processed_at     = CASE WHEN p_status IN ('success','failed','cancelled') THEN now() ELSE q.processed_at END
   WHERE q.id = p_id
     AND q.status = 'processing'
     AND q.claim_token = p_claim_token
  RETURNING q.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Item % não está reservado com este claim_token (ou já foi concluído)', p_id
      USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_iam_queue_items(text, integer, integer, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.complete_iam_queue_item(uuid, text, text, text, text, text, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_iam_queue_item(uuid, text, text, text, text, text, timestamptz, integer, text) TO service_role;

-- versão antiga (assinatura com 6 parâmetros) — remove se existir
DROP FUNCTION IF EXISTS public.complete_iam_queue_item(uuid, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 6. Decisão de aprovação / reprocessamento (usadas pela UI e pelo MCP)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_decidir(
  p_ids     uuid[],
  p_decisao text,               -- 'approve' | 'reject' | 'cancel'
  p_motivo  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_item      record;
  v_aprovados int := 0;
  v_rejeitados int := 0;
  v_orfaos    int := 0;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador';
  END IF;
  IF p_decisao NOT IN ('approve','reject','cancel') THEN
    RAISE EXCEPTION 'Decisão inválida: %', p_decisao;
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  FOR v_item IN
    SELECT * FROM public.iam_queue WHERE id = ANY (p_ids) AND status IN ('waiting_approval','pending')
  LOOP
    IF p_decisao = 'approve' THEN
      IF v_item.action_type = 'review_orphan_entra' THEN
        -- revisão de conta órfã aprovada ⇒ desabilitar a conta no Entra
        -- (waiting_approval → pending → success, respeitando a máquina de estados)
        IF v_item.status = 'waiting_approval' THEN
          UPDATE public.iam_queue SET status = 'pending', approved_by = v_uid WHERE id = v_item.id;
        END IF;
        UPDATE public.iam_queue
           SET status = 'success', processed_by = 'orphan-approval',
               result_message = 'Revisão aprovada — conta enfileirada para desabilitação no Entra.'
         WHERE id = v_item.id AND status = 'pending';
        INSERT INTO public.iam_queue (action_type, status, target_identity, requested_by, resource_key, payload_json)
        VALUES ('disable_entra', 'pending',
                COALESCE(v_item.target_identity, v_item.payload_json->>'userPrincipalName', v_item.payload_json->>'mail'),
                'orphan-approval',
                'entra_account:' || COALESCE(v_item.payload_json->>'entra_id', v_item.target_identity),
                jsonb_build_object(
                  'reason', 'orphan_approved',
                  'entra_id', v_item.payload_json->>'entra_id',
                  'mail', COALESCE(v_item.payload_json->>'mail', v_item.payload_json->>'userPrincipalName'),
                  'displayName', v_item.payload_json->>'displayName',
                  'revokeSignInSessions', true))
        ON CONFLICT DO NOTHING;
        v_orfaos := v_orfaos + 1;
      ELSIF v_item.status = 'waiting_approval' THEN
        UPDATE public.iam_queue SET status = 'pending', approved_by = v_uid, rejection_reason = NULL WHERE id = v_item.id;
        v_aprovados := v_aprovados + 1;
      END IF;
    ELSIF p_decisao = 'reject' THEN
      UPDATE public.iam_queue
         SET status = 'rejected', rejection_reason = COALESCE(p_motivo, 'Rejeitado'), approved_by = v_uid
       WHERE id = v_item.id;
      v_rejeitados := v_rejeitados + 1;
    ELSE
      UPDATE public.iam_queue
         SET status = 'cancelled', result_message = COALESCE(p_motivo, result_message), processed_by = COALESCE(v_email, v_uid::text)
       WHERE id = v_item.id;
      v_rejeitados := v_rejeitados + 1;
    END IF;
  END LOOP;

  INSERT INTO public.auditoria (acao, entidade, resumo, operador, detalhes)
  VALUES ('decidir_iam_queue', 'iam_queue',
          format('%s: %s aprovado(s), %s rejeitado(s)/cancelado(s), %s órfão(s)', p_decisao, v_aprovados, v_rejeitados, v_orfaos),
          COALESCE(v_email, v_uid::text),
          jsonb_build_object('ids', p_ids, 'decisao', p_decisao, 'motivo', p_motivo));

  RETURN jsonb_build_object('aprovados', v_aprovados, 'rejeitados', v_rejeitados, 'orfaos', v_orfaos);
END;
$$;

CREATE OR REPLACE FUNCTION public.iam_queue_reprocessar(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   int;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador';
  END IF;
  UPDATE public.iam_queue
     SET status = 'pending', error_code = NULL, result_message = NULL, next_retry_at = NULL, retry_count = 0
   WHERE id = ANY (p_ids) AND status = 'failed';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.iam_queue_decidir(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_decidir(uuid[], text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.iam_queue_reprocessar(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_reprocessar(uuid[]) TO authenticated, service_role;

-- helper: nenhum motivo para anon enxergar tipos de ação/origens
REVOKE ALL ON FUNCTION public.iam_queue_distinct_actions_origins(text[]) FROM anon;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120000_iga_queue_state_machine.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120100_iga_effective_access_rpcs.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (2/7): acesso efetivo + enfileiramento centralizado
--
-- Antes: cinco lugares diferentes (frontend, CSV, expiração de exceção, revisão
-- externa, terceiros) montavam itens de iam_queue por conta própria, e remover
-- um perfil removia recursos que OUTRO perfil ativo ainda concedia.
--
-- Agora: toda geração de assign_*/remove_* passa por iam_enqueue_profile_actions /
-- iam_enqueue_resource_diff, que calculam o acesso efetivo (perfis ativos +
-- concessões individuais) e só removem o que deixou de ser concedido.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guarda de papel: service_role (auth.uid() nulo) ou admin/operador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_assert_operator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- service_role / jobs internos / triggers (sem JWT ou JWT de service_role)
    IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') NOT IN ('service_role', '') THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN;
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Identidade (colaborador ou terceiro) como JSON
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_identity(p_colaborador_id uuid, p_terceiro_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_colaborador_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'colaborador', 'id', c.id, 'nome', c.nome, 'email', c.email,
        'sam', c.sam_account_name, 'entra_id', c.entra_id, 'status', c.status::text,
        'target_identity', COALESCE(c.email, c.sam_account_name))
      FROM colaboradores c WHERE c.id = p_colaborador_id)
    WHEN p_terceiro_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'terceiro', 'id', t.id, 'nome', t.nome, 'email', t.email,
        'sam', NULL, 'entra_id', NULL, 'status', CASE WHEN t.ativo THEN 'ativo' ELSE 'inativo' END,
        'target_identity', t.email)
      FROM terceiros t WHERE t.id = p_terceiro_id)
    ELSE NULL END;
$$;

-- ---------------------------------------------------------------------------
-- Template de recurso → (chave, ações, payload)
-- tipo ∈ grupo | licenca | app | app_interno | sharepoint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_resource_template(
  p_tipo text, p_ref_id uuid, p_pasta_id uuid DEFAULT NULL, p_permissao text DEFAULT NULL, p_perfil_interno_id uuid DEFAULT NULL)
RETURNS TABLE (tipo text, resource_key text, action_assign text, action_remove text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    FROM aplicacoes a WHERE p_tipo = 'app' AND a.id = p_ref_id AND a.entra_id IS NOT NULL
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
$$;

-- Recursos concedidos por um conjunto de perfis
CREATE OR REPLACE FUNCTION public.iam_profile_resources(p_perfil_ids uuid[])
RETURNS TABLE (perfil_id uuid, tipo text, resource_key text, action_assign text, action_remove text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg.perfil_id, t.* FROM perfil_grupos pg, LATERAL iam_resource_template('grupo', pg.grupo_id) t
   WHERE pg.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pl.perfil_id, t.* FROM perfil_licencas pl, LATERAL iam_resource_template('licenca', pl.licenca_id) t
   WHERE pl.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pa.perfil_id, t.* FROM perfil_aplicacoes pa, LATERAL iam_resource_template('app', pa.aplicacao_id) t
   WHERE pa.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT pai.perfil_id, t.* FROM perfil_apps_internos pai, LATERAL iam_resource_template('app_interno', pai.aplicacao_id, NULL, NULL, pai.perfil_interno_id) t
   WHERE pai.perfil_id = ANY (p_perfil_ids)
  UNION ALL
  SELECT ps.perfil_id, t.* FROM perfil_sharepoint ps,
         LATERAL iam_resource_template('sharepoint', ps.site_id, COALESCE(ps.pasta_nivel2_id, ps.pasta_nivel1_id), ps.permissao) t
   WHERE ps.perfil_id = ANY (p_perfil_ids);
$$;

-- Perfis ativos de uma identidade (materializados em perfil_atribuicoes, inclui origem cargo)
CREATE OR REPLACE FUNCTION public.iam_active_perfil_ids(p_colaborador_id uuid, p_terceiro_id uuid, p_exclude uuid[] DEFAULT '{}')
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT pa.perfil_id), '{}'::uuid[])
    FROM perfil_atribuicoes pa
    JOIN perfis_acesso p ON p.id = pa.perfil_id AND p.ativo = true
   WHERE pa.ativo = true
     AND ((p_colaborador_id IS NOT NULL AND pa.colaborador_id = p_colaborador_id)
       OR (p_terceiro_id IS NOT NULL AND pa.terceiro_id = p_terceiro_id))
     AND NOT (pa.perfil_id = ANY (COALESCE(p_exclude, '{}'::uuid[])));
$$;

-- Chave de recurso derivada de um item da fila (compatível com itens antigos sem resource_key)
CREATE OR REPLACE FUNCTION public.iam_queue_resource_key(p_action text, p_payload jsonb, p_resource_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_resource_key, CASE
    WHEN p_action IN ('assign_group','remove_group')       THEN 'grupo:'   || (p_payload->>'groupId')
    WHEN p_action IN ('assign_license','remove_license')   THEN 'licenca:' || (p_payload->>'skuId')
    WHEN p_action IN ('assign_app','remove_app') AND COALESCE(p_payload->>'resourceType','') <> 'sharepoint'
                                                           THEN 'app:'     || (p_payload->>'appId')
    WHEN p_action IN ('assign_sharepoint','remove_sharepoint') OR COALESCE(p_payload->>'resourceType','') = 'sharepoint'
                                                           THEN 'sharepoint:' || (p_payload->>'siteId') || ':' || COALESCE(p_payload->>'driveItemId','') || ':' || COALESCE(p_payload->>'permission','leitura')
    WHEN p_action IN ('create_user_app','disable_user_app','delete_user_app')
                                                           THEN 'app_interno:' || (p_payload->>'aplicacao_id') || ':' || COALESCE(p_payload->>'perfil_interno_id','')
    ELSE NULL END);
$$;

-- Concessões individuais vigentes (ledger da fila): último assign_* com sucesso
-- de origem manual_individual/entra_sync sem remove_* posterior com sucesso.
CREATE OR REPLACE FUNCTION public.iam_individual_resources(p_colaborador_id uuid, p_terceiro_id uuid)
RETURNS TABLE (resource_key text, action_assign text, action_remove text, payload jsonb, requested_by text, target_identity text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH itens AS (
    SELECT q.*, iam_queue_resource_key(q.action_type, q.payload_json, q.resource_key) AS rk
      FROM iam_queue q
     WHERE q.status = 'success'
       AND ((p_colaborador_id IS NOT NULL AND q.colaborador_id = p_colaborador_id)
         OR (p_terceiro_id IS NOT NULL AND q.terceiro_id = p_terceiro_id))
       AND (q.action_type LIKE 'assign\_%' OR q.action_type LIKE 'remove\_%')
  ), ultimos AS (
    SELECT DISTINCT ON (rk) *
      FROM itens
     WHERE rk IS NOT NULL
     ORDER BY rk, COALESCE(processed_at, created_at) DESC
  )
  SELECT u.rk, u.action_type, replace(u.action_type, 'assign_', 'remove_'), u.payload_json, u.requested_by, u.target_identity
    FROM ultimos u
   WHERE u.action_type LIKE 'assign\_%'
     AND u.requested_by IN ('manual_individual', 'entra_sync');
$$;

-- ---------------------------------------------------------------------------
-- Inserção de um item da fila (sempre com identidade e resource_key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_insert(
  p_identity jsonb, p_action text, p_payload jsonb, p_resource_key text,
  p_requested_by text, p_status text DEFAULT 'pending', p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab uuid := CASE WHEN p_identity->>'tipo' = 'colaborador' THEN (p_identity->>'id')::uuid END;
  v_terc  uuid := CASE WHEN p_identity->>'tipo' = 'terceiro'    THEN (p_identity->>'id')::uuid END;
  v_status text := COALESCE(p_status, 'pending');
  v_onprem boolean := COALESCE((p_payload->>'onPremisesSync')::boolean, false) AND p_action = 'assign_group';
  v_rows int;
BEGIN
  IF p_identity IS NULL THEN RETURN false; END IF;
  INSERT INTO public.iam_queue (
    action_type, status, colaborador_id, terceiro_id, target_identity, requested_by, resource_key, payload_json,
    error_code, result_message, processed_at, processed_by)
  VALUES (
    p_action,
    CASE WHEN v_onprem THEN 'failed' ELSE v_status END,
    v_colab, v_terc,
    p_identity->>'target_identity',
    p_requested_by,
    p_resource_key,
    p_payload
      || jsonb_build_object('displayName', p_identity->>'nome', 'mail', p_identity->>'email',
                            'samAccountName', p_identity->>'sam', 'entra_id', p_identity->>'entra_id')
      || COALESCE(p_extra, '{}'::jsonb),
    CASE WHEN v_onprem THEN 'on_premises_managed' END,
    CASE WHEN v_onprem THEN 'Grupo "' || COALESCE(p_payload->>'groupName', p_payload->>'groupId') || '" é gerenciado pelo AD local' END,
    CASE WHEN v_onprem THEN now() END,
    CASE WHEN v_onprem THEN 'sistema' END)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enfileira assign/remove de PERFIS inteiros para uma identidade
--   remove: só recursos que nenhum outro perfil ativo (nem concessão individual) concede
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_profile_actions(
  p_colaborador_id uuid, p_terceiro_id uuid, p_perfil_ids uuid[], p_mode text,
  p_requested_by text, p_status text DEFAULT 'pending', p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      jsonb;
  v_n       int := 0;
  v_res     record;
  v_keep    text[];
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_mode NOT IN ('assign','remove') THEN RAISE EXCEPTION 'p_mode deve ser assign|remove'; END IF;
  IF COALESCE(array_length(p_perfil_ids, 1), 0) = 0 THEN RETURN 0; END IF;

  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN 0; END IF;
  IF COALESCE(v_id->>'email','') = '' AND COALESCE(v_id->>'sam','') = '' THEN
    INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Identidade sem e-mail/SAM',
            format('%s não tem e-mail nem samAccountName — %s de perfil não pôde ser enfileirado.', v_id->>'nome', p_mode),
            'aviso', 'identidade_incompleta', v_id->>'tipo', v_id->>'id',
            CASE WHEN v_id->>'tipo' = 'colaborador' THEN '/colaboradores/' ELSE '/terceiros/' END || (v_id->>'id'));
    RETURN 0;
  END IF;

  IF p_mode = 'remove' THEN
    -- recursos que continuam concedidos por outros perfis ativos ou individualmente
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_keep FROM (
      SELECT r.resource_key AS k
        FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id, p_perfil_ids)) r
      UNION
      SELECT i.resource_key FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i
    ) s;
  END IF;

  FOR v_res IN
    SELECT DISTINCT ON (resource_key) resource_key, action_assign, action_remove, payload, perfil_id
      FROM public.iam_profile_resources(p_perfil_ids)
     ORDER BY resource_key
  LOOP
    IF p_mode = 'remove' AND v_res.resource_key = ANY (COALESCE(v_keep, '{}')) THEN
      CONTINUE; -- ainda concedido por outro caminho
    END IF;
    IF public.iam_queue_insert(
         v_id,
         CASE WHEN p_mode = 'assign' THEN v_res.action_assign ELSE v_res.action_remove END,
         v_res.payload, v_res.resource_key, p_requested_by, p_status,
         jsonb_build_object('perfil_id', v_res.perfil_id, 'reason', COALESCE(p_motivo, 'perfil_' || p_mode)))
    THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enfileira um DIFF de recursos avulsos (edição da composição de um perfil,
-- concessão/remoção individual, aprovação de solicitação)
--   p_added / p_removed: [{"tipo":"grupo|licenca|app|app_interno|sharepoint","id":uuid,"pasta_id":uuid,"permissao":text,"perfil_interno_id":uuid}]
--   p_exclude_perfil_ids: perfil cuja composição está sendo editada (não conta como "ainda concede")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_resource_diff(
  p_colaborador_id uuid, p_terceiro_id uuid,
  p_added jsonb DEFAULT '[]'::jsonb, p_removed jsonb DEFAULT '[]'::jsonb,
  p_requested_by text DEFAULT 'sistema', p_status text DEFAULT 'pending',
  p_motivo text DEFAULT NULL, p_exclude_perfil_ids uuid[] DEFAULT '{}', p_check_individual boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   jsonb;
  v_n    int := 0;
  v_item jsonb;
  v_res  record;
  v_keep text[] := '{}';
BEGIN
  PERFORM public.iam_assert_operator();
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN 0; END IF;
  IF COALESCE(v_id->>'email','') = '' AND COALESCE(v_id->>'sam','') = '' THEN RETURN 0; END IF;

  IF jsonb_array_length(COALESCE(p_removed, '[]'::jsonb)) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT k), '{}') INTO v_keep FROM (
      SELECT r.resource_key AS k
        FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id, p_exclude_perfil_ids)) r
      UNION
      SELECT i.resource_key FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i WHERE p_check_individual
    ) s;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_added, '[]'::jsonb)) LOOP
    FOR v_res IN
      SELECT * FROM public.iam_resource_template(
        v_item->>'tipo', (v_item->>'id')::uuid, NULLIF(v_item->>'pasta_id','')::uuid,
        v_item->>'permissao', NULLIF(v_item->>'perfil_interno_id','')::uuid)
    LOOP
      IF public.iam_queue_insert(v_id, v_res.action_assign, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                                 jsonb_build_object('reason', COALESCE(p_motivo, 'diff_assign')))
      THEN v_n := v_n + 1; END IF;
    END LOOP;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_removed, '[]'::jsonb)) LOOP
    FOR v_res IN
      SELECT * FROM public.iam_resource_template(
        v_item->>'tipo', (v_item->>'id')::uuid, NULLIF(v_item->>'pasta_id','')::uuid,
        v_item->>'permissao', NULLIF(v_item->>'perfil_interno_id','')::uuid)
    LOOP
      IF v_res.resource_key = ANY (v_keep) THEN CONTINUE; END IF;
      IF public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                                 jsonb_build_object('reason', COALESCE(p_motivo, 'diff_remove')))
      THEN v_n := v_n + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- Remoção de TODAS as concessões individuais vigentes (leaver)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_individual_removals(
  p_colaborador_id uuid, p_terceiro_id uuid, p_requested_by text, p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   jsonb;
  v_n    int := 0;
  v_res  record;
  v_snap jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('enfileirados', 0, 'snapshot', '[]'::jsonb); END IF;

  FOR v_res IN SELECT * FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) LOOP
    v_snap := v_snap || jsonb_build_object('action_type', v_res.action_assign, 'payload_json', v_res.payload,
                                           'target_identity', v_res.target_identity, 'requested_by', v_res.requested_by,
                                           'resource_key', v_res.resource_key);
    IF public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, v_res.resource_key, p_requested_by, p_status,
                               jsonb_build_object('reason', 'remocao_individual_leaver'))
    THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('enfileirados', v_n, 'snapshot', v_snap);
END;
$$;

-- ---------------------------------------------------------------------------
-- Visão de acesso efetivo (para telas/relatórios/recertificação)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_effective_access(p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL)
RETURNS TABLE (origem text, perfil_id uuid, tipo text, resource_key text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'perfil', r.perfil_id, r.tipo, r.resource_key, r.payload
    FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id)) r
  UNION ALL
  SELECT 'individual', NULL, split_part(i.resource_key, ':', 1), i.resource_key, i.payload
    FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) i;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.iam_assert_operator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_identity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_resource_template(text, uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_profile_resources(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_active_perfil_ids(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_individual_resources(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_queue_insert(jsonb, text, jsonb, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iam_enqueue_profile_actions(uuid, uuid, uuid[], text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_enqueue_resource_diff(uuid, uuid, jsonb, jsonb, text, text, text, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_enqueue_individual_removals(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.iam_effective_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_identity(uuid, uuid), public.iam_resource_template(text, uuid, uuid, text, uuid),
  public.iam_profile_resources(uuid[]), public.iam_active_perfil_ids(uuid, uuid, uuid[]),
  public.iam_individual_resources(uuid, uuid), public.iam_enqueue_profile_actions(uuid, uuid, uuid[], text, text, text, text),
  public.iam_enqueue_resource_diff(uuid, uuid, jsonb, jsonb, text, text, text, uuid[], boolean),
  public.iam_enqueue_individual_removals(uuid, uuid, text, text), public.iam_effective_access(uuid, uuid),
  public.iam_assert_operator()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_queue_insert(jsonb, text, jsonb, text, text, text, jsonb) TO service_role;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120100_iga_effective_access_rpcs.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120200_iga_jml_rpcs.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (3/7): ciclo de vida JML como RPCs transacionais
--
-- Antes: colaboradorLifecycle.ts / preLeaver.ts / terceiroLifecycle.ts /
-- provisionCargoAcessos.ts rodavam ~15 escritas sequenciais no NAVEGADOR (sem
-- transação) e o CSV tinha uma segunda implementação divergente no servidor.
--
-- Agora: uma implementação, atômica, usada pela UI, pelo CSV, pela expiração
-- automática e pelo MCP/agente.
-- =============================================================================

ALTER TABLE public.terceiros ADD COLUMN IF NOT EXISTS sam_account_name text;

-- Parâmetros novos (não sobrescreve valores existentes)
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('iam_enable_requires_approval', 'true',
   'Reabilitar conta (enable_entra / AD enabled) sempre entra em waiting_approval, independente do gate global'),
  ('mover_remocao_modo', 'aprovacao',
   'Ao mudar de cargo: aprovacao = remoções do cargo anterior entram em waiting_approval; imediato = pending; nenhum = não remove (legado)'),
  ('csv_leaver_limite_pct', '5',
   'Limite (%) de colaboradores ausentes no CSV acima do qual a importação NÃO aplica desligamentos e gera alerta crítico'),
  ('csv_leaver_limite_abs', '50',
   'Limite absoluto de ausentes no CSV acima do qual a importação NÃO aplica desligamentos'),
  ('modo_operacao', 'producao', 'producao | simulacao — em simulação nenhum executor age na fila'),
  ('iam_execution_mode', 'agent_orchestrated',
   'lovable_cloud = process-iam-queue executa Graph/apps; agent_orchestrated = Órigo/Hermes agent executa via iam-agent-api')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.iam_param(p_chave text, p_default text DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT valor FROM parametros WHERE chave = p_chave), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Provisiona os perfis de um cargo (materializa perfil_atribuicoes + enfileira)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_provisionar_cargo(
  p_colaborador_id uuid, p_cargo_id uuid, p_requested_by text, p_status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfis   uuid[];
  v_novos    uuid[];
  v_queued   int := 0;
  v_mat      int := 0;
BEGIN
  IF p_cargo_id IS NULL THEN RETURN jsonb_build_object('materializados', 0, 'enfileirados', 0); END IF;
  SELECT COALESCE(array_agg(cp.perfil_id), '{}') INTO v_perfis
    FROM cargo_perfis cp JOIN perfis_acesso p ON p.id = cp.perfil_id AND p.ativo
   WHERE cp.cargo_id = p_cargo_id;
  IF COALESCE(array_length(v_perfis, 1), 0) = 0 THEN RETURN jsonb_build_object('materializados', 0, 'enfileirados', 0); END IF;

  -- só perfis que ainda não estão ativos para a pessoa
  SELECT COALESCE(array_agg(p), '{}') INTO v_novos
    FROM unnest(v_perfis) p
   WHERE NOT EXISTS (SELECT 1 FROM perfil_atribuicoes pa WHERE pa.colaborador_id = p_colaborador_id AND pa.perfil_id = p AND pa.ativo);

  INSERT INTO perfil_atribuicoes (perfil_id, colaborador_id, origem, ativo)
  SELECT p, p_colaborador_id, 'cargo', true FROM unnest(v_novos) p;
  GET DIAGNOSTICS v_mat = ROW_COUNT;

  IF v_mat > 0 THEN
    v_queued := public.iam_enqueue_profile_actions(p_colaborador_id, NULL, v_novos, 'assign', p_requested_by, p_status, 'cargo');
  END IF;
  RETURN jsonb_build_object('materializados', v_mat, 'enfileirados', v_queued, 'perfis', to_jsonb(v_novos));
END;
$$;

-- ---------------------------------------------------------------------------
-- MOVER: mudança de cargo com delta (adiciona o novo, remove o exclusivo do antigo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_alterar_cargo(
  p_colaborador_id uuid, p_novo_cargo_id uuid, p_operador text,
  p_origem text DEFAULT 'manual', p_cargo_anterior_id uuid DEFAULT NULL, p_atualizar_colaborador boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c          colaboradores%ROWTYPE;
  v_old        uuid;
  v_old_perfis uuid[];
  v_new_perfis uuid[];
  v_add        uuid[];
  v_rem        uuid[];
  v_modo       text := COALESCE(public.iam_param('mover_remocao_modo', 'aprovacao'), 'aprovacao');
  v_req        text := COALESCE(p_operador, 'sistema');
  v_revoked    int := 0;
  v_prov       jsonb;
  v_q_rem      int := 0;
  v_identity   jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_old := COALESCE(p_cargo_anterior_id, v_c.cargo_id);

  IF p_atualizar_colaborador AND v_c.cargo_id IS DISTINCT FROM p_novo_cargo_id THEN
    UPDATE colaboradores SET cargo_id = p_novo_cargo_id WHERE id = p_colaborador_id;
  END IF;

  SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_old_perfis FROM cargo_perfis WHERE cargo_id = v_old;
  SELECT COALESCE(array_agg(perfil_id), '{}') INTO v_new_perfis FROM cargo_perfis WHERE cargo_id = p_novo_cargo_id;
  SELECT COALESCE(array_agg(p), '{}') INTO v_add FROM unnest(v_new_perfis) p WHERE NOT (p = ANY (v_old_perfis));
  SELECT COALESCE(array_agg(p), '{}') INTO v_rem FROM unnest(v_old_perfis) p WHERE NOT (p = ANY (v_new_perfis));

  -- 1. revoga atribuições de origem cargo que não pertencem ao novo cargo
  UPDATE perfil_atribuicoes
     SET ativo = false, data_revogacao = now()
   WHERE colaborador_id = p_colaborador_id AND origem = 'cargo' AND ativo
     AND NOT (perfil_id = ANY (v_new_perfis));
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  -- 2. materializa e enfileira o novo cargo
  v_prov := public.jml_provisionar_cargo(p_colaborador_id, p_novo_cargo_id, v_req, 'pending');

  -- 3. remove recursos exclusivos do cargo antigo (acesso efetivo já considera o novo cargo)
  IF v_modo <> 'nenhum' AND COALESCE(array_length(v_rem, 1), 0) > 0 THEN
    v_q_rem := public.iam_enqueue_profile_actions(
      p_colaborador_id, NULL, v_rem, 'remove', v_req,
      CASE WHEN v_modo = 'imediato' THEN 'pending' ELSE 'waiting_approval' END, 'mover');
  END IF;

  v_identity := public.iam_identity(p_colaborador_id, NULL);

  IF v_old IS DISTINCT FROM p_novo_cargo_id THEN
    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('mover', 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('cargo_id', v_old, 'cargo', (SELECT nome FROM cargos WHERE id = v_old)),
            jsonb_build_object('cargo_id', p_novo_cargo_id, 'cargo', (SELECT nome FROM cargos WHERE id = p_novo_cargo_id),
                               'perfis_adicionados', to_jsonb(v_add), 'perfis_removidos', to_jsonb(v_rem),
                               'remocoes_enfileiradas', v_q_rem, 'modo_remocao', v_modo, 'operador', v_req));
    INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('jml_mover', 'colaboradores', p_colaborador_id::text, v_req,
            format('Mover: %s — cargo alterado (%s perfis adicionados, %s removidos, %s remoções enfileiradas [%s])',
                   v_c.nome, COALESCE(array_length(v_add,1),0), COALESCE(array_length(v_rem,1),0), v_q_rem, v_modo),
            jsonb_build_object('cargo_anterior', v_old, 'cargo_novo', p_novo_cargo_id, 'origem', p_origem));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'provisioned', COALESCE((v_prov->>'materializados')::int, 0),
    'queued_assign', COALESCE((v_prov->>'enfileirados')::int, 0),
    'revoked', v_revoked,
    'queued_remove', v_q_rem,
    'modo_remocao', v_modo,
    'skippedDirectory', (COALESCE(v_identity->>'email','') = '' AND COALESCE(v_identity->>'sam','') = ''));
END;
$$;

-- ---------------------------------------------------------------------------
-- LEAVER / SOFT DISABLE / REATIVAÇÃO (status do colaborador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_alterar_status(
  p_colaborador_id uuid, p_novo_status text, p_operador text,
  p_origem text DEFAULT 'manual', p_motivo text DEFAULT NULL, p_skip_status_update boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c            colaboradores%ROWTYPE;
  v_old          text;
  v_new          text := p_novo_status;
  v_req          text := COALESCE(p_operador, 'sistema');
  v_id           jsonb;
  v_sam          text;
  v_target       text;
  v_hard         boolean;
  v_soft         boolean;
  v_react        boolean;
  v_was_pre      boolean := false;
  v_gap          int;
  v_exc          record;
  v_perfis       uuid[] := '{}';
  v_rem_perfis   int := 0;
  v_indiv        jsonb := '{}'::jsonb;
  v_gestor_email text;
  v_gestor_nome  text;
  v_enable_st    text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
  v_last         jsonb;
  v_restored     int := 0;
  v_item         jsonb;
  v_prov         jsonb := '{}'::jsonb;
  v_evento_tipo  text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF v_new NOT IN ('ativo','inativo','ferias','afastado','desligado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || COALESCE(v_new,'(nulo)'));
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_old := v_c.status::text;
  IF v_old = v_new THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;

  v_hard  := v_new IN ('inativo','desligado') AND v_old NOT IN ('inativo','desligado');
  v_soft  := v_old = 'ativo' AND v_new IN ('ferias','afastado');
  v_react := v_old <> 'ativo' AND v_new = 'ativo';

  -- Exceção "manter ativo" aprovada e vigente bloqueia desativação hard (qualquer origem)
  IF v_hard THEN
    SELECT id, validade, solicitante INTO v_exc
      FROM excecoes
     WHERE colaborador_id = p_colaborador_id AND tipo_excecao = 'manter_ativo' AND status = 'aprovada'
       AND validade >= current_date
     ORDER BY validade DESC LIMIT 1;
    IF v_exc.id IS NOT NULL THEN
      INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
      VALUES ('bloquear_desativacao_excecao', 'colaboradores', p_colaborador_id::text, v_req,
              format('Desativação de %s bloqueada por exceção "Manter Ativo" válida até %s (%s)', v_c.nome, v_exc.validade, p_origem));
      RETURN jsonb_build_object('ok', false, 'blocked', true,
        'error', format('Existe uma exceção "Manter Ativo" aprovada até %s (Solicitante: %s). Remova ou aguarde a expiração para desativar.',
                        to_char(v_exc.validade, 'DD/MM/YYYY'), v_exc.solicitante));
    END IF;
  END IF;

  IF NOT p_skip_status_update THEN
    UPDATE colaboradores SET status = v_new::status_colaborador WHERE id = p_colaborador_id;
  END IF;

  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('alterar_status_colaborador', 'colaboradores', p_colaborador_id::text, v_req,
          format('Status: %s → %s — %s', v_old, v_new, v_c.nome),
          jsonb_build_object('origem', p_origem, 'motivo', p_motivo));

  v_id     := public.iam_identity(p_colaborador_id, NULL);
  v_sam    := NULLIF(v_id->>'sam', '');
  v_target := NULLIF(v_id->>'target_identity', '');

  -- ═══════════ DESATIVAÇÃO ═══════════
  IF v_hard OR v_soft THEN
    v_was_pre := COALESCE(v_c.suspenso_preventivo, false);
    v_gap := CASE WHEN v_was_pre AND v_c.suspenso_em IS NOT NULL
                  THEN GREATEST(0, floor(extract(epoch FROM (now() - v_c.suspenso_em)) / 86400))::int END;

    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Colaborador desabilitado',
            CASE WHEN v_was_pre
                 THEN format('%s foi formalmente desligado. Suspensão preventiva já estava ativa há %s dia(s) — reconciliado.', v_c.nome, v_gap)
                 ELSE format('%s teve o status alterado para %s (%s)', v_c.nome, v_new, p_origem) END,
            (CASE WHEN v_was_pre THEN 'info' ELSE 'aviso' END)::severidade_alerta, 'colaborador_desabilitado',
            'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);

    IF NOT v_was_pre THEN
      IF v_sam IS NOT NULL THEN
        PERFORM public.iam_queue_insert(v_id, 'disable',
          jsonb_build_object('status', 'disabled', 'status_anterior', v_old, 'status_novo', v_new,
                             'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','disabled'),
                             'motivo', p_motivo),
          'ad_account:' || v_sam, v_req, 'pending');
      END IF;
      IF v_target IS NOT NULL THEN
        PERFORM public.iam_queue_insert(v_id, 'disable_entra',
          jsonb_build_object('revokeSignInSessions', v_hard, 'motivo', p_motivo, 'status_novo', v_new),
          'entra_account:' || v_target, v_req, 'pending');
      END IF;
      IF v_sam IS NULL AND v_target IS NULL THEN
        INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
        VALUES ('Desativação sem identidade', format('%s foi desativado no IAM, mas não tem e-mail/SAM — nenhuma conta foi desabilitada.', v_c.nome),
                'critico', 'identidade_incompleta', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
      END IF;
    ELSE
      UPDATE colaboradores
         SET suspenso_preventivo = false, suspenso_em = NULL, suspenso_por = NULL, suspenso_motivo = NULL
       WHERE id = p_colaborador_id;
    END IF;

    IF v_hard AND p_origem = 'manual' THEN
      UPDATE colaboradores
         SET desligado_manual = true, desligado_manual_em = now(), desligado_manual_por = v_req
       WHERE id = p_colaborador_id;
    END IF;

    IF v_hard THEN
      v_perfis := public.iam_active_perfil_ids(p_colaborador_id, NULL);
      UPDATE perfil_atribuicoes SET ativo = false, data_revogacao = now()
       WHERE colaborador_id = p_colaborador_id AND ativo;
      IF COALESCE(array_length(v_perfis, 1), 0) > 0 THEN
        v_rem_perfis := public.iam_enqueue_profile_actions(p_colaborador_id, NULL, v_perfis, 'remove', v_req, 'pending', 'leaver');
      END IF;
      v_indiv := public.iam_enqueue_individual_removals(p_colaborador_id, NULL, v_req, 'pending');
    END IF;

    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('leaver', 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('status', v_old, 'tipo_desativacao', CASE WHEN v_hard THEN 'hard' ELSE 'soft' END,
                               'perfis', to_jsonb(v_perfis), 'recursos_individuais', COALESCE(v_indiv->'snapshot', '[]'::jsonb),
                               'pre_suspensao_aplicada', v_was_pre, 'gap_dias', v_gap),
            jsonb_build_object('status', v_new, 'motivo', p_motivo, 'operador', v_req,
                               'remocoes_perfil', v_rem_perfis, 'remocoes_individuais', COALESCE((v_indiv->>'enfileirados')::int, 0)));
  END IF;

  -- ═══════════ REATIVAÇÃO ═══════════
  IF v_react THEN
    UPDATE colaboradores
       SET desligado_manual = false, desligado_manual_em = NULL, desligado_manual_por = NULL
     WHERE id = p_colaborador_id;

    IF v_sam IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'update',
        jsonb_build_object('status', 'enabled', 'status_anterior', v_old, 'status_novo', 'ativo',
                           'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','enabled'),
                           'motivo', p_motivo),
        'ad_account:' || v_sam, v_req, v_enable_st);
    END IF;
    IF v_target IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'enable_entra',
        jsonb_build_object('motivo', p_motivo, 'status_anterior', v_old),
        'entra_account:' || v_target, v_req, v_enable_st);
    END IF;

    -- desligamento hard revogou os perfis: reprovisiona o cargo
    IF NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE colaborador_id = p_colaborador_id AND ativo) AND v_c.cargo_id IS NOT NULL THEN
      v_prov := public.jml_provisionar_cargo(p_colaborador_id, v_c.cargo_id, v_req, 'pending');
    END IF;

    -- recursos individuais do último leaver hard: voltam SÓ com aprovação
    SELECT dados_antes INTO v_last FROM eventos_jml
     WHERE colaborador_id = p_colaborador_id AND tipo = 'leaver' ORDER BY created_at DESC LIMIT 1;
    IF v_last->>'tipo_desativacao' = 'hard' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_last->'recursos_individuais', '[]'::jsonb)) LOOP
        IF public.iam_queue_insert(v_id, v_item->>'action_type', COALESCE(v_item->'payload_json', '{}'::jsonb),
             COALESCE(v_item->>'resource_key', public.iam_queue_resource_key(v_item->>'action_type', v_item->'payload_json', NULL)),
             COALESCE(v_item->>'requested_by', 'manual_individual'), 'waiting_approval',
             jsonb_build_object('reason', 'restauracao_reativacao'))
        THEN v_restored := v_restored + 1; END IF;
      END LOOP;
    END IF;

    v_evento_tipo := CASE WHEN v_old IN ('inativo','desligado') THEN 'joiner' ELSE 'mover' END;
    INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES (v_evento_tipo::tipo_evento_jml, 'executado', p_colaborador_id, v_c.nome, p_origem,
            jsonb_build_object('status', v_old),
            jsonb_build_object('status', v_new, 'motivo', p_motivo, 'operador', v_req, 'retorno', v_old IN ('ferias','afastado'),
                               'recursos_individuais_restaurados', v_restored, 'cargo_reprovisionado', v_prov));
    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES ('Colaborador reativado', format('%s foi reativado (%s). Reabilitação de conta aguarda %s.', v_c.nome, p_origem,
            CASE WHEN v_enable_st = 'waiting_approval' THEN 'aprovação' ELSE 'execução' END),
            'info', 'colaborador_reativado', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
  END IF;

  IF v_c.gestor_id IS NOT NULL THEN
    SELECT nome, email INTO v_gestor_nome, v_gestor_email FROM colaboradores WHERE id = v_c.gestor_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status_anterior', v_old, 'status_novo', v_new,
    'tipo_desativacao', CASE WHEN v_hard THEN 'hard' WHEN v_soft THEN 'soft' ELSE NULL END,
    'reativacao', v_react,
    'perfis_revogados', COALESCE(array_length(v_perfis, 1), 0),
    'remocoes_enfileiradas', v_rem_perfis + COALESCE((v_indiv->>'enfileirados')::int, 0),
    'restaurados', v_restored,
    'gestor_email', v_gestor_email, 'gestor_nome', v_gestor_nome);
END;
$$;

-- ---------------------------------------------------------------------------
-- PRÉ-LEAVER (suspensão preventiva) e reversão
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jml_pre_leaver(p_colaborador_id uuid, p_motivo text, p_operador text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c      colaboradores%ROWTYPE;
  v_id     jsonb;
  v_sam    text;
  v_target text;
  v_req    text := 'pre_leaver:' || COALESCE(p_operador, 'sistema');
  v_gestor_email text;
  v_gestor_nome  text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Justificativa obrigatória (mínimo 10 caracteres).');
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_id := public.iam_identity(p_colaborador_id, NULL);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Colaborador sem e-mail/samAccountName — não há identidade para suspender.');
  END IF;

  UPDATE colaboradores
     SET suspenso_preventivo = true, suspenso_em = now(), suspenso_por = COALESCE(p_operador,'sistema'), suspenso_motivo = trim(p_motivo)
   WHERE id = p_colaborador_id;

  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'disable',
      jsonb_build_object('status','disabled','motivo','pre_leaver','justificativa', trim(p_motivo),
                         'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','disabled')),
      'ad_account:' || v_sam, v_req, 'pending');
  END IF;
  PERFORM public.iam_queue_insert(v_id, 'disable_entra',
    jsonb_build_object('motivo','pre_leaver','justificativa', trim(p_motivo),'revokeSignInSessions', true),
    'entra_account:' || v_target, v_req, 'pending');

  INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('pre_leaver', 'executado', p_colaborador_id, v_c.nome, 'manual',
          jsonb_build_object('suspenso_preventivo', false),
          jsonb_build_object('suspenso_preventivo', true, 'motivo', trim(p_motivo), 'operador', p_operador, 'suspenso_em', now()));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('suspender_preventivo', 'colaboradores', p_colaborador_id::text, p_operador,
          'Suspensão preventiva: ' || v_c.nome, jsonb_build_object('motivo', trim(p_motivo), 'identity', v_target));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Suspensão preventiva ativada', format('%s teve os acessos suspensos preventivamente. Motivo: %s', v_c.nome, trim(p_motivo)),
          'critico', 'pre_leaver_ativado', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);

  IF v_c.gestor_id IS NOT NULL THEN SELECT nome, email INTO v_gestor_nome, v_gestor_email FROM colaboradores WHERE id = v_c.gestor_id; END IF;
  RETURN jsonb_build_object('ok', true, 'gestor_email', v_gestor_email, 'gestor_nome', v_gestor_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.jml_pre_leaver_reverter(p_colaborador_id uuid, p_motivo text, p_operador text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c      colaboradores%ROWTYPE;
  v_id     jsonb;
  v_sam    text;
  v_target text;
  v_req    text := 'pre_leaver_revert:' || COALESCE(p_operador, 'sistema');
  v_st     text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Justificativa obrigatória (mínimo 10 caracteres).');
  END IF;
  SELECT * INTO v_c FROM colaboradores WHERE id = p_colaborador_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  v_id := public.iam_identity(p_colaborador_id, NULL);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador sem identidade.'); END IF;

  UPDATE colaboradores
     SET suspenso_preventivo = false, suspenso_em = NULL, suspenso_por = NULL, suspenso_motivo = NULL
   WHERE id = p_colaborador_id;

  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'update',
      jsonb_build_object('status','enabled','motivo','pre_leaver_revertido','justificativa', trim(p_motivo),
                         'changed_fields', jsonb_build_array('status'), 'new_values', jsonb_build_object('status','enabled')),
      'ad_account:' || v_sam, v_req, v_st);
  END IF;
  PERFORM public.iam_queue_insert(v_id, 'enable_entra',
    jsonb_build_object('motivo','pre_leaver_revertido','justificativa', trim(p_motivo)),
    'entra_account:' || v_target, v_req, v_st);

  INSERT INTO eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('pre_leaver_revertido', 'executado', p_colaborador_id, v_c.nome, 'manual',
          jsonb_build_object('suspenso_preventivo', true),
          jsonb_build_object('suspenso_preventivo', false, 'motivo', trim(p_motivo), 'operador', p_operador));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('reverter_suspensao_preventiva', 'colaboradores', p_colaborador_id::text, p_operador,
          'Suspensão preventiva revertida: ' || v_c.nome, jsonb_build_object('motivo', trim(p_motivo)));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Suspensão preventiva revertida', format('%s teve a suspensão preventiva revertida. Motivo: %s', v_c.nome, trim(p_motivo)),
          'aviso', 'pre_leaver_revertido', 'colaborador', p_colaborador_id::text, '/colaboradores/' || p_colaborador_id);
  RETURN jsonb_build_object('ok', true, 'reabilitacao', v_st);
END;
$$;

-- ---------------------------------------------------------------------------
-- TERCEIROS: desligar / reativar (usado pela UI e pela expiração automática)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terceiro_alterar_status(
  p_terceiro_id uuid, p_ativo boolean, p_operador text, p_origem text DEFAULT 'manual', p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t        terceiros%ROWTYPE;
  v_id       jsonb;
  v_sam      text;
  v_target   text;
  v_req      text := COALESCE(p_operador, 'sistema');
  v_perfis   uuid[] := '{}';
  v_rem      int := 0;
  v_indiv    jsonb := '{}'::jsonb;
  v_last     jsonb;
  v_restored int := 0;
  v_pf_rest  int := 0;
  v_item     jsonb;
  v_p        uuid;
  v_st       text := CASE WHEN public.iam_param('iam_enable_requires_approval','true') = 'true' THEN 'waiting_approval' ELSE 'pending' END;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT * INTO v_t FROM terceiros WHERE id = p_terceiro_id;
  IF v_t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Terceiro não encontrado'); END IF;
  IF v_t.ativo = p_ativo THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;
  v_id := public.iam_identity(NULL, p_terceiro_id);
  v_sam := NULLIF(v_id->>'sam',''); v_target := NULLIF(v_id->>'target_identity','');

  IF NOT p_ativo THEN
    UPDATE terceiros SET ativo = false WHERE id = p_terceiro_id;
    v_perfis := public.iam_active_perfil_ids(NULL, p_terceiro_id);
    UPDATE perfil_atribuicoes SET ativo = false, data_revogacao = now() WHERE terceiro_id = p_terceiro_id AND ativo;
    IF COALESCE(array_length(v_perfis,1),0) > 0 THEN
      v_rem := public.iam_enqueue_profile_actions(NULL, p_terceiro_id, v_perfis, 'remove', v_req, 'pending', 'leaver_terceiro');
    END IF;
    v_indiv := public.iam_enqueue_individual_removals(NULL, p_terceiro_id, v_req, 'pending');
    IF v_sam IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'disable',
        jsonb_build_object('status','disabled','motivo', p_motivo,'changed_fields', jsonb_build_array('status'),'new_values', jsonb_build_object('status','disabled')),
        'ad_account:' || v_sam, v_req, 'pending');
    END IF;
    IF v_target IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_id, 'disable_entra',
        jsonb_build_object('revokeSignInSessions', true, 'motivo', p_motivo), 'entra_account:' || v_target, v_req, 'pending');
    ELSE
      INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
      VALUES ('Terceiro sem identidade', format('%s foi desligado no IAM, mas não tem e-mail — nenhuma conta foi desabilitada.', v_t.nome),
              'critico', 'identidade_incompleta', 'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
    END IF;
    INSERT INTO eventos_jml (tipo, status, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('leaver', 'executado', v_t.nome, p_origem,
            jsonb_build_object('terceiro_id', p_terceiro_id, 'nome', v_t.nome, 'email', v_t.email, 'contrato_fim', v_t.contrato_fim,
                               'tipo_desativacao', 'hard', 'perfis', to_jsonb(v_perfis), 'recursos_individuais', COALESCE(v_indiv->'snapshot','[]'::jsonb)),
            jsonb_build_object('ativo', false, 'motivo', p_motivo, 'operador', v_req,
                               'remocoes_perfil', v_rem, 'remocoes_individuais', COALESCE((v_indiv->>'enfileirados')::int,0)));
    INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('desligar_terceiro', 'terceiros', p_terceiro_id::text, v_req,
            format('Terceiro %s desligado (%s) — %s perfis revogados, %s remoções enfileiradas', v_t.nome, p_origem,
                   COALESCE(array_length(v_perfis,1),0), v_rem + COALESCE((v_indiv->>'enfileirados')::int,0)),
            jsonb_build_object('motivo', p_motivo, 'origem', p_origem));
    INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
    VALUES (CASE WHEN p_origem = 'auto_expiracao' THEN 'Terceiro expirado: ' || v_t.nome ELSE 'Terceiro desligado' END,
            format('%s%s foi desligado (%s). %s perfis revogados; conta e acessos enfileirados para remoção.',
                   v_t.nome, CASE WHEN v_t.empresa_terceira IS NOT NULL THEN ' (' || v_t.empresa_terceira || ')' ELSE '' END,
                   COALESCE(p_motivo, p_origem), COALESCE(array_length(v_perfis,1),0)),
            'aviso'::severidade_alerta, CASE WHEN p_origem = 'auto_expiracao' THEN 'terceiro_expirado' ELSE 'terceiro_desligado' END,
            'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
    RETURN jsonb_build_object('ok', true, 'perfisRevogados', COALESCE(array_length(v_perfis,1),0),
                              'remocoes', v_rem + COALESCE((v_indiv->>'enfileirados')::int,0));
  END IF;

  -- reativação
  UPDATE terceiros SET ativo = true WHERE id = p_terceiro_id;
  IF v_sam IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'update',
      jsonb_build_object('status','enabled','motivo', p_motivo,'changed_fields', jsonb_build_array('status'),'new_values', jsonb_build_object('status','enabled')),
      'ad_account:' || v_sam, v_req, v_st);
  END IF;
  IF v_target IS NOT NULL THEN
    PERFORM public.iam_queue_insert(v_id, 'enable_entra', jsonb_build_object('motivo', p_motivo), 'entra_account:' || v_target, v_req, v_st);
  END IF;
  SELECT dados_antes INTO v_last FROM eventos_jml
   WHERE tipo = 'leaver' AND (dados_antes->>'terceiro_id')::uuid = p_terceiro_id ORDER BY created_at DESC LIMIT 1;
  FOR v_p IN SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(v_last->'perfis','[]'::jsonb)) x LOOP
    IF EXISTS (SELECT 1 FROM perfis_acesso WHERE id = v_p AND ativo)
       AND NOT EXISTS (SELECT 1 FROM perfil_atribuicoes WHERE terceiro_id = p_terceiro_id AND perfil_id = v_p AND ativo) THEN
      INSERT INTO perfil_atribuicoes (perfil_id, terceiro_id, origem, ativo) VALUES (v_p, p_terceiro_id, 'reativacao', true);
      v_pf_rest := v_pf_rest + 1;
    END IF;
  END LOOP;
  IF v_pf_rest > 0 THEN
    PERFORM public.iam_enqueue_profile_actions(NULL, p_terceiro_id, public.iam_active_perfil_ids(NULL, p_terceiro_id), 'assign', v_req, v_st, 'reativacao');
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_last->'recursos_individuais','[]'::jsonb)) LOOP
    IF public.iam_queue_insert(v_id, v_item->>'action_type', COALESCE(v_item->'payload_json','{}'::jsonb),
         COALESCE(v_item->>'resource_key', public.iam_queue_resource_key(v_item->>'action_type', v_item->'payload_json', NULL)),
         COALESCE(v_item->>'requested_by','manual_individual'), 'waiting_approval', jsonb_build_object('reason','restauracao_reativacao'))
    THEN v_restored := v_restored + 1; END IF;
  END LOOP;
  INSERT INTO eventos_jml (tipo, status, colaborador_nome, origem, dados_antes, dados_depois)
  VALUES ('joiner', 'executado', v_t.nome, p_origem, jsonb_build_object('terceiro_id', p_terceiro_id, 'ativo', false),
          jsonb_build_object('ativo', true, 'perfis_restaurados', v_pf_rest, 'recursos_individuais_restaurados', v_restored, 'operador', v_req));
  INSERT INTO auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('reativar_terceiro', 'terceiros', p_terceiro_id::text, v_req,
          format('Terceiro %s reativado — %s perfis e %s recursos individuais restaurados (aguardando aprovação)', v_t.nome, v_pf_rest, v_restored));
  INSERT INTO alertas (titulo, mensagem, severidade, tipo, ref_tipo, ref_id, ref_url)
  VALUES ('Terceiro reativado', format('%s foi reativado com %s perfis e %s recursos individuais (reabilitação aguarda aprovação).', v_t.nome, v_pf_rest, v_restored),
          'info', 'terceiro_reativado', 'terceiro', p_terceiro_id::text, '/terceiros/' || p_terceiro_id);
  RETURN jsonb_build_object('ok', true, 'perfisRestaurados', v_pf_rest, 'individuaisRestaurados', v_restored);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.iam_param(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_provisionar_cargo(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jml_alterar_cargo(uuid, uuid, text, text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_alterar_status(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_pre_leaver(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.jml_pre_leaver_reverter(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terceiro_alterar_status(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_param(text, text),
  public.jml_alterar_cargo(uuid, uuid, text, text, uuid, boolean),
  public.jml_alterar_status(uuid, text, text, text, text, boolean),
  public.jml_pre_leaver(uuid, text, text), public.jml_pre_leaver_reverter(uuid, text, text),
  public.terceiro_alterar_status(uuid, boolean, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.jml_provisionar_cargo(uuid, uuid, text, text) TO service_role;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120200_iga_jml_rpcs.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120300_iga_security_hardening.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (4/7): segurança e segregação
--   • auditoria append-only (sem UPDATE/DELETE, nem via service_role)
--   • parametros só admin
--   • papel platform_admin: único que pode executar admin_exec_sql/ddl e purgar
--   • identidades nunca são apagadas: DELETE em colaboradores vira desligamento
--   • eventos_jml sobrevivem ao colaborador (FK SET NULL em vez de CASCADE)
--   • token de revisão externa com validade
--   • apply_reconcile_updates só para service_role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auditoria imutável
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "Admins can delete auditoria" ON public.auditoria;
REVOKE UPDATE, DELETE ON public.auditoria FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.auditoria_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- retenção controlada: só com a flag de sessão explícita (RPC de platform_admin)
  IF COALESCE(current_setting('origo.allow_audit_purge', true), '') = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'auditoria é append-only (% não permitido)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_auditoria_immutable ON public.auditoria;
CREATE TRIGGER trg_auditoria_immutable
  BEFORE UPDATE OR DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.auditoria_immutable();

-- ---------------------------------------------------------------------------
-- 2. Parâmetros: escrita só admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert parametros" ON public.parametros;
DROP POLICY IF EXISTS "Admins can update parametros" ON public.parametros;
DROP POLICY IF EXISTS "Admins can delete parametros" ON public.parametros;
DROP POLICY IF EXISTS "Only admins insert parametros" ON public.parametros;
CREATE POLICY "Only admins insert parametros" ON public.parametros FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Only admins update parametros" ON public.parametros;
CREATE POLICY "Only admins update parametros" ON public.parametros FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Only admins delete parametros" ON public.parametros;
CREATE POLICY "Only admins delete parametros" ON public.parametros FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Papel platform_admin
--    (o valor novo do enum não pode ser usado como literal nesta mesma
--     transação; por isso as comparações abaixo usam role::text)
-- ---------------------------------------------------------------------------
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'platform_admin');
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- só platform_admin concede/revoga platform_admin
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));
DROP POLICY IF EXISTS "Admins update roles" ON public.user_roles;
CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND (role::text <> 'platform_admin' OR public.is_platform_admin(auth.uid())));

-- SQL/DDL arbitrário (MCP) passa a exigir platform_admin
CREATE OR REPLACE FUNCTION public.admin_exec_ddl(p_sql text, p_description text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES ('admin_exec_ddl', 'database', COALESCE(p_description, 'Migração/DDL via MCP'),
          COALESCE((auth.jwt() ->> 'email'), auth.uid()::text), jsonb_build_object('sql', p_sql, 'description', p_description));
  EXECUTE p_sql;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_exec_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  INSERT INTO public.auditoria(acao, entidade, resumo, operador, detalhes)
  VALUES ('admin_exec_sql', 'database', 'Execução SQL via MCP', COALESCE((auth.jwt() ->> 'email'), auth.uid()::text), jsonb_build_object('sql', p_sql));
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || p_sql || ') t' INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Identidades nunca são apagadas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.colaboradores_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('origo.allow_hard_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status::text <> 'desligado' THEN
    UPDATE public.colaboradores SET status = 'desligado', updated_at = now() WHERE id = OLD.id;
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('delete_convertido_em_desligamento', 'colaboradores', OLD.id::text,
          COALESCE(auth.jwt() ->> 'email', current_user),
          format('Tentativa de exclusão de %s convertida em desligamento (identidades são preservadas para auditoria).', OLD.nome));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_colaboradores_soft_delete ON public.colaboradores;
CREATE TRIGGER trg_colaboradores_soft_delete
  BEFORE DELETE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.colaboradores_soft_delete();

-- Purga real (dados de teste/importação errada): só platform_admin, auditada
CREATE OR REPLACE FUNCTION public.admin_purge_colaboradores(p_ids uuid[], p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel platform_admin';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 10 caracteres)';
  END IF;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('purgar_colaboradores', 'colaboradores', COALESCE(auth.jwt() ->> 'email', auth.uid()::text),
          format('Purga permanente de %s colaborador(es): %s', COALESCE(array_length(p_ids,1),0), p_motivo),
          jsonb_build_object('ids', p_ids));
  PERFORM set_config('origo.allow_hard_delete', 'on', true);
  DELETE FROM public.perfil_atribuicoes WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.colab_quarentena WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.excecoes WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.revisao_itens WHERE colaborador_id = ANY (p_ids);
  DELETE FROM public.colaboradores WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('origo.allow_hard_delete', 'off', true);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_purge_colaboradores(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_colaboradores(uuid[], text) TO authenticated;

-- eventos JML sobrevivem ao colaborador
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
   WHERE conrelid = 'public.eventos_jml'::regclass AND contype = 'f'
     AND pg_get_constraintdef(oid) LIKE '%colaboradores(id)%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.eventos_jml DROP CONSTRAINT %I', v_con);
  END IF;
  ALTER TABLE public.eventos_jml
    ADD CONSTRAINT eventos_jml_colaborador_id_fkey FOREIGN KEY (colaborador_id)
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Revisão externa: token com validade
-- ---------------------------------------------------------------------------
ALTER TABLE public.revisoes ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
UPDATE public.revisoes SET token_expires_at = COALESCE(data_fim::timestamptz + interval '7 days', created_at + interval '30 days')
 WHERE token IS NOT NULL AND token_expires_at IS NULL;
ALTER TABLE public.revisoes ALTER COLUMN token_expires_at SET DEFAULT now() + interval '30 days';

CREATE OR REPLACE FUNCTION public.get_revisao_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT row_to_json(r.*) FROM revisoes r
   WHERE r.token = p_token
     AND (r.token_expires_at IS NULL OR r.token_expires_at > now())
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_revisao_itens_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_agg(ri.*)
    FROM revisao_itens ri
    JOIN revisoes r ON r.id = ri.revisao_id
   WHERE r.token = p_token
     AND (r.token_expires_at IS NULL OR r.token_expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- 6. Índices auxiliares de segurança/consulta
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_auditoria_timestamp ON public.auditoria ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade ON public.auditoria (entidade, entidade_id);
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120300_iga_security_hardening.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120400_iga_identity_constraints.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (5/7): unicidade de identidade e quarentena real
--   • perfil_atribuicoes: no máximo UMA atribuição ativa por perfil × pessoa
--   • colaboradores: e-mail / SAM / matrícula únicos (criados só se a base
--     atual não tiver duplicidades — caso contrário gera alerta em vez de falhar)
--   • colab_quarentena passa a receber linhas inválidas/duplicadas do CSV
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. perfil_atribuicoes: desativa duplicatas ativas (mantém a mais antiga) e cria índice único parcial
-- ---------------------------------------------------------------------------
WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY perfil_id, colaborador_id ORDER BY data_concessao NULLS LAST, created_at) AS rn
    FROM public.perfil_atribuicoes WHERE ativo AND colaborador_id IS NOT NULL
)
UPDATE public.perfil_atribuicoes pa SET ativo = false, data_revogacao = now()
  FROM dup WHERE pa.id = dup.id AND dup.rn > 1;

WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY perfil_id, terceiro_id ORDER BY data_concessao NULLS LAST, created_at) AS rn
    FROM public.perfil_atribuicoes WHERE ativo AND terceiro_id IS NOT NULL
)
UPDATE public.perfil_atribuicoes pa SET ativo = false, data_revogacao = now()
  FROM dup WHERE pa.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_perfil_atribuicoes_ativa_colab
  ON public.perfil_atribuicoes (perfil_id, colaborador_id) WHERE ativo AND colaborador_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_perfil_atribuicoes_ativa_terceiro
  ON public.perfil_atribuicoes (perfil_id, terceiro_id) WHERE ativo AND terceiro_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. colaboradores: índices únicos condicionais
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_dups int;
  v_msg  text := '';
BEGIN
  -- e-mail
  SELECT count(*) INTO v_dups FROM (SELECT lower(email) FROM public.colaboradores WHERE email IS NOT NULL AND email <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_email ON public.colaboradores (lower(email)) WHERE email IS NOT NULL AND email <> '';
  ELSE
    v_msg := v_msg || format('%s e-mail(s) duplicado(s); ', v_dups);
  END IF;
  -- SAM
  SELECT count(*) INTO v_dups FROM (SELECT lower(sam_account_name) FROM public.colaboradores WHERE sam_account_name IS NOT NULL AND sam_account_name <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_sam ON public.colaboradores (lower(sam_account_name)) WHERE sam_account_name IS NOT NULL AND sam_account_name <> '';
  ELSE
    v_msg := v_msg || format('%s SAM(s) duplicado(s); ', v_dups);
  END IF;
  -- matrícula
  SELECT count(*) INTO v_dups FROM (SELECT matricula FROM public.colaboradores WHERE matricula IS NOT NULL AND matricula <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_matricula ON public.colaboradores (matricula) WHERE matricula IS NOT NULL AND matricula <> '';
  ELSE
    v_msg := v_msg || format('%s matrícula(s) duplicada(s); ', v_dups);
  END IF;

  IF v_msg <> '' THEN
    RAISE NOTICE 'Índices únicos de identidade NÃO criados por duplicidade existente: %', v_msg;
    INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_url)
    VALUES ('Duplicidade de identidades',
            'A base tem identidades duplicadas e os índices únicos não puderam ser criados: ' || v_msg ||
            'Corrija (mescle/desligue duplicatas) e reaplique a migration 20260917120400.',
            'critico', 'identidade_duplicada', '/colaboradores');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Quarentena de importação (linhas inválidas, duplicadas, ambíguas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS dados jsonb;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS detalhe text;
ALTER TABLE public.colab_quarentena ALTER COLUMN colaborador_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_colab_quarentena_status ON public.colab_quarentena (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_colab_quarentena_job ON public.colab_quarentena (import_job_id);

-- colab_quarentena pode não ter RLS/políticas completas: garante leitura/escrita para admin/operador
ALTER TABLE public.colab_quarentena ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quarentena select" ON public.colab_quarentena;
DROP POLICY IF EXISTS "quarentena write" ON public.colab_quarentena;
CREATE POLICY "quarentena select" ON public.colab_quarentena FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "quarentena write" ON public.colab_quarentena FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120400_iga_identity_constraints.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120500_iga_cleanup_dead_objects.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (6/7): remoção do que não faz mais sentido
--   • motor de regras (nunca executado: sem tela, sem chamador, sem efeito no Entra)
--   • colab_snapshots (zero referências)
--   • guardrails do restore de julho/2026 (iam_restore_guardrails + suppress_restore_*)
--     — só remove se a chave estiver INATIVA; se estiver ativa a migration falha de
--       propósito para que alguém avalie antes (ela suprimia inserts do ciclo diário).
--   Tabelas backup_* e iam_change_backups são mantidas (são dados).
-- =============================================================================

-- 1. Motor de regras
DROP TABLE IF EXISTS public.regra_condicoes CASCADE;
DROP TABLE IF EXISTS public.regra_resultados CASCADE;
DROP TABLE IF EXISTS public.regras CASCADE;
DROP TYPE IF EXISTS public.status_regra;

-- 2. Snapshots sem uso
DROP TABLE IF EXISTS public.colab_snapshots CASCADE;

-- 3. Guardrails de restore
DO $$
BEGIN
  IF to_regclass('public.iam_restore_guardrails') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.iam_restore_guardrails WHERE active = true) THEN
      RAISE EXCEPTION 'iam_restore_guardrails está ATIVO: os triggers suppress_restore_* estão suprimindo inserts do ciclo diário. Desative (UPDATE iam_restore_guardrails SET active=false) e reaplique.';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.suppress_restore_colaborador_delete() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_eventos_jml() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_iam_queue() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_perfil_atribuicoes() CASCADE;
DROP TABLE IF EXISTS public.iam_restore_guardrails CASCADE;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120500_iga_cleanup_dead_objects.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120600_iga_scheduling.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- IGA hardening (7/7): agenda (pg_cron + pg_net + Vault)
--
-- Nada rodava sozinho: ciclo diário do RH, expiração de exceções/terceiros e
-- recertificação dependiam de alguém clicar. Os jobs abaixo chamam as edge
-- functions com a service role key guardada no Vault (nunca em migrations).
--
-- Passo manual ÚNICO (SQL editor do Lovable Cloud, uma vez):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'origo_functions_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'origo_service_role_key');
-- Sem os segredos, os jobs apenas registram NOTICE e não fazem nada.
-- =============================================================================

-- (CREATE EXTENSION IF NOT EXISTS dispara o event trigger do Supabase mesmo com a
--  extensão já instalada e falha com "dependent privileges exist"; por isso o guard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_cron_invoke(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
  v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'origo_functions_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'origo_service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'iam_cron_invoke(%): segredos origo_functions_url/origo_service_role_key ausentes no Vault — job ignorado', p_function;
    RETURN NULL;
  END IF;
  IF public.iam_param('modo_operacao', 'producao') = 'simulacao' AND p_function IN ('process-iam-queue') THEN
    RETURN NULL;
  END IF;
  SELECT net.http_post(
           url     := rtrim(v_url, '/') || '/' || p_function,
           headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'apikey', v_key),
           body    := COALESCE(p_body, '{}'::jsonb),
           timeout_milliseconds := 120000)
    INTO v_req;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('cron_invoke', 'scheduler', 'pg_cron', 'Job agendado disparou ' || p_function, jsonb_build_object('request_id', v_req, 'body', p_body));
  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION public.iam_cron_invoke(text, jsonb) FROM PUBLIC, anon, authenticated;

-- (re)agenda de forma idempotente
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid, jobname FROM cron.job WHERE jobname LIKE 'origo-%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  -- 05:00 UTC — expira exceções de acesso vencidas
  PERFORM cron.schedule('origo-expire-exceptions', '0 5 * * *',
    $cmd$ SELECT public.iam_cron_invoke('expire-access-exceptions', '{}'::jsonb) $cmd$);
  -- 05:15 UTC — recertificação automática + expiração/revalidação de terceiros
  PERFORM cron.schedule('origo-auto-recertification', '15 5 * * *',
    $cmd$ SELECT public.iam_cron_invoke('auto-recertification', '{}'::jsonb) $cmd$);
  -- 06:30 UTC — ciclo diário do RH (SharePoint → reconcile → fila)
  PERFORM cron.schedule('origo-daily-cycle', '30 6 * * *',
    $cmd$ SELECT public.iam_cron_invoke('run-daily-cycle', '{}'::jsonb) $cmd$);
  -- a cada 15 min — processa a fila (no modo agent_orchestrated retorna 202 e sai)
  PERFORM cron.schedule('origo-process-queue', '*/15 * * * *',
    $cmd$ SELECT public.iam_cron_invoke('process-iam-queue', '{}'::jsonb) $cmd$);
  -- semanal, domingo 04:00 UTC — auditoria por amostragem da reconciliação
  PERFORM cron.schedule('origo-audit-reconciliation', '0 4 * * 0',
    $cmd$ SELECT public.iam_cron_invoke('audit-reconciliation', '{}'::jsonb) $cmd$);
END $$;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120600_iga_scheduling.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260917120700_iga_integration_params.sql >>>>>>>>>>>>>>>>>>>>>>
-- Parâmetros das integrações (antes hardcoded nas edge functions)
INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('csv_email_dominio', 'origoenergia.com.br', 'Domínio do e-mail corporativo gerado para novos colaboradores do CSV do RH'),
  ('csv_gerar_email_corporativo', 'true', 'Gerar e-mail corporativo (nome.sobrenome@dominio) para novos colaboradores cujo e-mail no RH não é corporativo'),
  ('ad_upn_dominio', 'ebessolar.local', 'Domínio do userPrincipalName usado na criação de contas no AD local'),
  ('sharepoint_rh_site', 'origoenergia.sharepoint.com:/sites/dataanalytics', 'Site do SharePoint onde o RH publica a base de colaboradores'),
  ('sharepoint_rh_pasta', 'RH_COLAB', 'Pasta (no drive raiz do site) com os CSVs do RH'),
  ('sharepoint_rh_prefixo', 'base_colab_', 'Prefixo dos arquivos CSV do RH'),
  ('iam_orphan_ignore_prefixes', 'svc.,admin.,test.,sa.,adm.,notif.,noreply,sync.', 'Prefixos de UPN ignorados na detecção de contas órfãs no Entra')
ON CONFLICT (chave) DO NOTHING;
-- <<<<<<<<<<<<<<<<<<<<<< 20260917120700_iga_integration_params.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260918100000_hermes_unico_executor.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- Hermes/Órigo Agente como ÚNICO executor + limpeza de opções de teste
--
-- 1. Só o agente executa (AD, Entra, SharePoint, apps, reset de senha):
--    - parâmetros iam_execution_mode / modo_operacao (simulação) deixam de existir
--    - job origo-process-queue (process-iam-queue) sai da agenda
--    - iam_cron_invoke sem a exceção de simulação
--    - tabela iam_agent_status (heartbeat do agente → dashboard)
--    - reset de senha vira item da fila (iam_enqueue_reset_password) executado pelo agente
-- 2. Remoção de opções/dados de teste: parâmetros do scaffold (2Easy, dupla aprovação…),
--    dados de demonstração da migration inicial (UUIDs fixos), tabelas nunca escritas
--    (evento_jml_acoes / evento_jml_aprovacoes), funções órfãs.
-- 3. Fluxos que ainda rodavam no navegador viram RPCs transacionais:
--    colaborador_salvar, terceiro_salvar, excecao_decidir, iam_revogar_individual,
--    iam_queue_reprocessar_falhas, dashboard_metrics, iam_queue_stats.
-- Tudo idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Parâmetros: remove opções de teste/legado, garante os reais com descrição
-- ---------------------------------------------------------------------------
DELETE FROM public.parametros
 WHERE chave IN ('iam_execution_mode', 'modo_operacao', 'max_tentativas_jml',
                 'aprovacao_dupla_leaver', 'importacao_automatica', 'dias_alerta_contrato');

INSERT INTO public.parametros (chave, valor, descricao) VALUES
  ('iam_approval_required', 'true', 'Exigir aprovação manual antes de qualquer ação ir para o agente executor'),
  ('iam_enable_requires_approval', 'true', 'Reabilitação de conta (retorno, reversão de pré-leaver, recontratação) sempre exige aprovação'),
  ('mover_remocao_modo', 'aprovacao', 'Mover: o que fazer com acessos exclusivos do cargo anterior (aprovacao | imediato | nenhum)'),
  ('csv_leaver_limite_pct', '5', 'Importação RH: percentual máximo de desligamentos por arquivo (base ≥ 20 ativos)'),
  ('csv_leaver_limite_abs', '50', 'Importação RH: número máximo absoluto de desligamentos por arquivo'),
  ('csv_email_dominio', 'origoenergia.com.br', 'Domínio do e-mail corporativo gerado para novos colaboradores'),
  ('csv_gerar_email_corporativo', 'true', 'Gerar e-mail corporativo quando o RH não informa um e-mail do domínio'),
  ('ad_upn_dominio', 'ebessolar.local', 'Domínio UPN das contas criadas no Active Directory'),
  ('sharepoint_rh_site', 'origoenergia.sharepoint.com:/sites/dataanalytics', 'Site SharePoint onde o RH publica a base'),
  ('sharepoint_rh_pasta', 'RH_COLAB', 'Pasta (dentro de Documentos) com os arquivos do RH'),
  ('sharepoint_rh_prefixo', 'base_colab_', 'Prefixo do nome do arquivo CSV do RH'),
  ('licenca_critico_pct', '90', 'Percentual de uso a partir do qual uma licença é considerada crítica'),
  ('priv_role_max_membros', '3', 'Máximo recomendado de membros em uma role privilegiada antes de alertar'),
  ('revisao_periodicidade_dias', '90', 'Periodicidade (dias) das revisões automáticas de acesso por aplicação'),
  ('terceiro_revalidacao_dias', '45', 'Dias sem revalidação após os quais o responsável por um terceiro é notificado'),
  ('terceiro_email_dominio', 'parceiroorigoenergia.com.br', 'Domínio do e-mail gerado para terceiros'),
  ('iam_orphan_ignore_prefixes', 'svc.,admin.,test.,sa.,adm.,notif.,noreply,sync.', 'Prefixos de UPN ignorados na detecção de contas órfãs no Entra'),
  ('entra_roles_last_sync', '', 'Sistema: timestamp da última sincronização de roles privilegiadas')
ON CONFLICT (chave) DO UPDATE SET descricao = EXCLUDED.descricao;

-- ---------------------------------------------------------------------------
-- 2. Agenda: process-iam-queue não existe mais; sem modo simulação
-- ---------------------------------------------------------------------------
DO $$
DECLARE j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'origo-process-queue' LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_cron_invoke(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
  v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'origo_functions_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'origo_service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'iam_cron_invoke(%): segredos origo_functions_url/origo_service_role_key ausentes no Vault — job ignorado', p_function;
    RETURN NULL;
  END IF;
  SELECT net.http_post(
           url     := rtrim(v_url, '/') || '/' || p_function,
           headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'apikey', v_key),
           body    := COALESCE(p_body, '{}'::jsonb),
           timeout_milliseconds := 120000)
    INTO v_req;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('cron_invoke', 'scheduler', 'pg_cron', 'Job agendado disparou ' || p_function, jsonb_build_object('request_id', v_req, 'body', p_body));
  RETURN v_req;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Objetos mortos
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.evento_jml_acoes CASCADE;       -- só o seed de demo escrevia
DROP TABLE IF EXISTS public.evento_jml_aprovacoes CASCADE;  -- idem
DROP FUNCTION IF EXISTS public.cleanup_expired_iam_change_backups();
DROP FUNCTION IF EXISTS public.iam_backup_actor();
DROP FUNCTION IF EXISTS public.has_any_app_role(uuid);
DO $$
DECLARE v_n int;
BEGIN
  IF to_regclass('public.iam_change_backups') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.iam_change_backups' INTO v_n;
    IF v_n = 0 THEN
      EXECUTE 'DROP TABLE public.iam_change_backups';
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Dados de demonstração do scaffold (UUIDs fixos da migration inicial).
--    Só remove as linhas exatamente com esses ids — nada criado pelo uso real.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_colabs uuid[] := ARRAY['f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000003',
                           'f0000000-0000-0000-0000-000000000004','f0000000-0000-0000-0000-000000000005','f0000000-0000-0000-0000-000000000006']::uuid[];
  v_tercs  uuid[] := ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003']::uuid[];
  v_apps   uuid[] := ARRAY['80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003',
                           '80000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000006',
                           '80000000-0000-0000-0000-000000000007']::uuid[];
  v_perfis uuid[] := ARRAY['90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003',
                           '90000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000005','90000000-0000-0000-0000-000000000006']::uuid[];
  v_revs   uuid[] := ARRAY['cc000000-0000-0000-0000-000000000001','cc000000-0000-0000-0000-000000000002']::uuid[];
  v_evs    uuid[] := ARRAY['bb000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000002','bb000000-0000-0000-0000-000000000003',
                           'bb000000-0000-0000-0000-000000000004','bb000000-0000-0000-0000-000000000005']::uuid[];
  v_n int := 0; v_t int;
BEGIN
  PERFORM set_config('origo.allow_hard_delete', 'on', true);
  -- pessoas/eventos/revisões de demonstração (ids fixos; colaboradores só com e-mail @origo.com do scaffold)
  DELETE FROM public.revisao_itens WHERE revisao_id = ANY (v_revs) OR colaborador_id = ANY (v_colabs);
  DELETE FROM public.revisoes WHERE id = ANY (v_revs);
  DELETE FROM public.excecoes WHERE colaborador_id = ANY (v_colabs);
  DELETE FROM public.eventos_jml WHERE id = ANY (v_evs) OR colaborador_id = ANY (v_colabs);
  DELETE FROM public.perfil_atribuicoes WHERE colaborador_id = ANY (v_colabs) OR terceiro_id = ANY (v_tercs);
  DELETE FROM public.iam_queue WHERE colaborador_id = ANY (v_colabs) OR terceiro_id = ANY (v_tercs);
  DELETE FROM public.colaboradores WHERE id = ANY (v_colabs) AND email LIKE '%@origo.com';
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  DELETE FROM public.terceiros WHERE id = ANY (v_tercs) AND email LIKE '%@%.com' AND NOT EXISTS (SELECT 1 FROM public.perfil_atribuicoes pa WHERE pa.terceiro_id = terceiros.id AND pa.ativo);
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  -- perfis e aplicações de demonstração: só saem se NADA real ainda os usa
  -- (atribuição ativa, cargo, exceção, revisão em andamento, licença ou item de fila aberto)
  DELETE FROM public.perfis_acesso p WHERE p.id = ANY (v_perfis)
     AND NOT EXISTS (SELECT 1 FROM public.perfil_atribuicoes pa WHERE pa.perfil_id = p.id AND pa.ativo)
     AND NOT EXISTS (SELECT 1 FROM public.cargo_perfis cp WHERE cp.perfil_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.excecoes e WHERE e.perfil_id = p.id AND e.status::text IN ('pendente', 'aprovada'))
     AND NOT EXISTS (SELECT 1 FROM public.revisao_itens ri JOIN public.revisoes r ON r.id = ri.revisao_id WHERE ri.perfil_id = p.id AND r.status::text = 'em_andamento');
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  DELETE FROM public.licencas l WHERE l.aplicacao_id = ANY (v_apps)
     AND l.nome IN ('Microsoft 365 E3','SAP ERP User','Jira Cloud Standard','Slack Business+','AWS Reserved','Datadog Pro');
  DELETE FROM public.aplicacoes a WHERE a.id = ANY (v_apps) AND COALESCE(a.origem, 'manual') <> 'azure'
     AND NOT EXISTS (SELECT 1 FROM public.perfil_aplicacoes pa WHERE pa.aplicacao_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM public.licencas l WHERE l.aplicacao_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM public.revisoes r WHERE r.aplicacao_id = a.id AND r.status::text = 'em_andamento');
  GET DIAGNOSTICS v_t = ROW_COUNT; v_n := v_n + v_t;
  PERFORM set_config('origo.allow_hard_delete', 'off', true);
  IF v_n > 0 THEN
    INSERT INTO public.auditoria (acao, entidade, operador, resumo)
    VALUES ('limpeza_dados_demo', 'sistema', 'migration', format('%s registro(s) de demonstração do scaffold removidos', v_n));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Identidade de terceiro com SAM (terceiros.sam_account_name existe desde 20260917120200)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_identity(p_colaborador_id uuid, p_terceiro_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_colaborador_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'colaborador', 'id', c.id, 'nome', c.nome, 'email', c.email,
        'sam', c.sam_account_name, 'entra_id', c.entra_id, 'status', c.status::text,
        'target_identity', COALESCE(c.email, c.sam_account_name))
      FROM colaboradores c WHERE c.id = p_colaborador_id)
    WHEN p_terceiro_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'tipo', 'terceiro', 'id', t.id, 'nome', t.nome, 'email', t.email,
        'sam', t.sam_account_name, 'entra_id', NULL, 'status', CASE WHEN t.ativo THEN 'ativo' ELSE 'inativo' END,
        'target_identity', COALESCE(t.email, t.sam_account_name))
      FROM terceiros t WHERE t.id = p_terceiro_id)
    ELSE NULL END;
$$;

-- eventos de terceiro passam a ter FK própria (antes só dentro de dados_antes)
ALTER TABLE public.eventos_jml ADD COLUMN IF NOT EXISTS terceiro_id uuid REFERENCES public.terceiros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eventos_jml_terceiro ON public.eventos_jml (terceiro_id) WHERE terceiro_id IS NOT NULL;
UPDATE public.eventos_jml e
   SET terceiro_id = (e.dados_antes->>'terceiro_id')::uuid
 WHERE e.terceiro_id IS NULL AND e.colaborador_id IS NULL
   AND e.dados_antes ? 'terceiro_id'
   AND EXISTS (SELECT 1 FROM public.terceiros t WHERE t.id::text = e.dados_antes->>'terceiro_id');
CREATE OR REPLACE FUNCTION public.eventos_jml_fill_terceiro()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.terceiro_id IS NULL AND NEW.colaborador_id IS NULL AND NEW.dados_antes ? 'terceiro_id' THEN
    SELECT t.id INTO NEW.terceiro_id FROM public.terceiros t WHERE t.id::text = NEW.dados_antes->>'terceiro_id';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_eventos_jml_fill_terceiro ON public.eventos_jml;
CREATE TRIGGER trg_eventos_jml_fill_terceiro BEFORE INSERT ON public.eventos_jml
  FOR EACH ROW EXECUTE FUNCTION public.eventos_jml_fill_terceiro();

-- ---------------------------------------------------------------------------
-- 6. Heartbeat do agente executor (alimentado pela iam-agent-api)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iam_agent_status (
  owner          text PRIMARY KEY,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_claim_at  timestamptz,
  last_result_at timestamptz,
  last_result    text,
  version        text,
  host           text,
  execute_mode   boolean,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.iam_agent_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view agent status" ON public.iam_agent_status;
CREATE POLICY "Authenticated can view agent status" ON public.iam_agent_status FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.iam_agent_status TO authenticated;
GRANT ALL ON public.iam_agent_status TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iam_agent_status') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iam_agent_status;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_agent_heartbeat(p_owner text, p_kind text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.iam_agent_status (owner, last_seen_at, last_claim_at, last_result_at, last_result, version, host, execute_mode, details)
  VALUES (COALESCE(p_owner, 'origo-agent'), now(),
          CASE WHEN p_kind = 'claim'  THEN now() END,
          CASE WHEN p_kind = 'result' THEN now() END,
          CASE WHEN p_kind = 'result' THEN p_details->>'result' END,
          p_details->>'version', p_details->>'host', (p_details->>'execute')::boolean, COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (owner) DO UPDATE SET
    last_seen_at   = now(),
    last_claim_at  = CASE WHEN p_kind = 'claim'  THEN now() ELSE iam_agent_status.last_claim_at END,
    last_result_at = CASE WHEN p_kind = 'result' THEN now() ELSE iam_agent_status.last_result_at END,
    last_result    = CASE WHEN p_kind = 'result' THEN p_details->>'result' ELSE iam_agent_status.last_result END,
    version        = COALESCE(p_details->>'version', iam_agent_status.version),
    host           = COALESCE(p_details->>'host', iam_agent_status.host),
    execute_mode   = COALESCE((p_details->>'execute')::boolean, iam_agent_status.execute_mode),
    details        = iam_agent_status.details || COALESCE(p_details, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iam_agent_heartbeat(text, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Reset de senha como item da fila (executado pelo agente; a senha temporária
--    nunca é gravada — a API a entrega por e-mail ao solicitante)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_enqueue_reset_password(
  p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_id     jsonb;
  v_priv   boolean := false;
  v_target text;
  v_key    text;
  v_item   uuid;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade não encontrada'); END IF;
  v_target := NULLIF(v_id->>'target_identity', '');
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade sem e-mail/login — não há conta para resetar'); END IF;
  IF COALESCE(v_email, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reset de senha exige um usuário logado (a senha temporária é enviada ao seu e-mail)');
  END IF;

  -- contas privilegiadas (roles do Entra / admins conhecidos): só admin do app
  IF v_id->>'entra_id' IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.entra_role_members WHERE user_entra_id = v_id->>'entra_id')
        OR EXISTS (SELECT 1 FROM public.contas_admin_conhecidas WHERE entra_id = v_id->>'entra_id') INTO v_priv;
  END IF;
  IF NOT v_priv AND v_id->>'email' IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.entra_role_members WHERE lower(user_email) = lower(v_id->>'email'))
        OR EXISTS (SELECT 1 FROM public.contas_admin_conhecidas WHERE lower(email) = lower(v_id->>'email')) INTO v_priv;
  END IF;
  IF v_priv AND NOT public.has_role(v_uid, 'admin') THEN
    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
    VALUES ('reset_senha_negado', COALESCE(v_id->>'tipo','colaboradores'), v_id->>'id', v_email,
            format('Reset de senha de conta privilegiada (%s) negado: requer admin', v_id->>'nome'));
    RETURN jsonb_build_object('ok', false, 'error', 'Conta privilegiada: reset de senha requer papel admin');
  END IF;

  v_key := 'password:' || v_target;
  IF EXISTS (SELECT 1 FROM public.iam_queue q WHERE q.action_type = 'reset_password' AND q.resource_key = v_key
              AND q.status IN ('pending','waiting_approval','processing')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe um reset de senha em andamento para esta conta');
  END IF;

  INSERT INTO public.iam_queue (action_type, status, colaborador_id, terceiro_id, target_identity, requested_by, resource_key, payload_json)
  VALUES ('reset_password', 'pending',
          CASE WHEN v_id->>'tipo' = 'colaborador' THEN (v_id->>'id')::uuid END,
          CASE WHEN v_id->>'tipo' = 'terceiro' THEN (v_id->>'id')::uuid END,
          v_target, v_email, v_key,
          jsonb_build_object('reason', COALESCE(p_motivo, 'reset_senha'),
                             'displayName', v_id->>'nome', 'mail', v_id->>'email', 'samAccountName', v_id->>'sam', 'entra_id', v_id->>'entra_id',
                             'forceChangePasswordNextSignIn', true, 'deliver_to', v_email, 'privilegiada', v_priv))
  RETURNING id INTO v_item;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('reset_senha_solicitado', COALESCE(v_id->>'tipo','colaboradores'), v_id->>'id', v_email,
          format('Reset de senha solicitado para %s (%s) — executado pelo agente; senha temporária vai para %s', v_id->>'nome', v_target, v_email),
          jsonb_build_object('item_id', v_item, 'motivo', p_motivo, 'privilegiada', v_priv));
  RETURN jsonb_build_object('ok', true, 'item_id', v_item, 'deliver_to', v_email);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_enqueue_reset_password(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_enqueue_reset_password(uuid, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Revogar uma concessão individual respeitando o acesso efetivo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_revogar_individual(
  p_colaborador_id uuid, p_terceiro_id uuid, p_resource_key text, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    jsonb;
  v_res   record;
  v_perfil text;
  v_ok    boolean;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  v_id := public.iam_identity(p_colaborador_id, p_terceiro_id);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Identidade não encontrada'); END IF;

  SELECT * INTO v_res FROM public.iam_individual_resources(p_colaborador_id, p_terceiro_id) WHERE resource_key = p_resource_key;
  IF v_res.resource_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Concessão individual não encontrada (ou já removida)');
  END IF;

  -- ainda concedido por um perfil ativo? então a "individual" é redundante — não remove
  SELECT pa.nome INTO v_perfil
    FROM public.iam_profile_resources(public.iam_active_perfil_ids(p_colaborador_id, p_terceiro_id)) r
    JOIN public.perfis_acesso pa ON pa.id = r.perfil_id
   WHERE r.resource_key = p_resource_key LIMIT 1;
  IF v_perfil IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Recurso ainda concedido pelo perfil "%s" — revogue o perfil ou ajuste sua composição', v_perfil));
  END IF;

  IF v_res.action_assign = 'assign_group' THEN
    IF COALESCE((v_res.payload->>'onPremisesSync')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo sincronizado do AD local — remova a associação no Active Directory');
    END IF;
    IF COALESCE((v_res.payload->>'dynamicMembership')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo dinâmico do Entra — ajuste a regra/atributos, não a associação');
    END IF;
    IF COALESCE((v_res.payload->>'isAssignableToRole')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Grupo privilegiado (role-assignable) — governança administrativa específica');
    END IF;
  END IF;

  v_ok := public.iam_queue_insert(v_id, v_res.action_remove, v_res.payload, p_resource_key, 'manual_individual', 'pending',
                                  jsonb_build_object('reason', COALESCE(p_motivo, 'revogacao_individual'), 'operador', v_email));
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe uma remoção aberta para este recurso');
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('revogar_individual', 'iam_queue', v_id->>'id', COALESCE(v_email, 'sistema'),
          format('Recurso individual %s revogado para %s', p_resource_key, v_id->>'nome'),
          jsonb_build_object('resource_key', p_resource_key, 'motivo', p_motivo, 'origem_concessao', v_res.requested_by));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.iam_revogar_individual(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_revogar_individual(uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Decisão de exceção (transacional, anti-auto-aprovação, provisiona via acesso efetivo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excecao_decidir(p_id uuid, p_decisao text, p_comentario text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_nome  text;
  v_e     excecoes%ROWTYPE;
  v_q     int := 0;
  v_st    text;
BEGIN
  PERFORM public.iam_assert_operator();
  IF p_decisao NOT IN ('aprovada', 'rejeitada') THEN RAISE EXCEPTION 'Decisão inválida: %', p_decisao; END IF;
  SELECT email, nome INTO v_email, v_nome FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_e FROM public.excecoes WHERE id = p_id FOR UPDATE;
  IF v_e.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Exceção não encontrada'); END IF;
  IF v_e.status::text <> 'pendente' THEN RETURN jsonb_build_object('ok', false, 'error', 'Exceção já decidida'); END IF;
  IF v_email IS NOT NULL AND (lower(v_e.solicitante) = lower(v_email) OR lower(v_e.solicitante) = lower(COALESCE(v_nome, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auto-aprovação não permitida: quem solicitou não pode decidir a exceção');
  END IF;

  UPDATE public.excecoes
     SET status = p_decisao::status_excecao, data_decisao = now(), aprovador = COALESCE(v_nome, v_email, 'sistema')
   WHERE id = p_id;

  IF p_decisao = 'aprovada' AND COALESCE(v_e.tipo_excecao, 'acesso') = 'acesso' AND v_e.colaborador_id IS NOT NULL AND v_e.perfil_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.perfil_atribuicoes WHERE colaborador_id = v_e.colaborador_id AND perfil_id = v_e.perfil_id AND ativo) THEN
      INSERT INTO public.perfil_atribuicoes (colaborador_id, perfil_id, origem, excecao_id, ativo)
      VALUES (v_e.colaborador_id, v_e.perfil_id, 'excecao', p_id, true);
    END IF;
    v_q := public.iam_enqueue_profile_actions(v_e.colaborador_id, NULL, ARRAY[v_e.perfil_id], 'assign',
                                              COALESCE(v_email, 'excecao_aprovada'), 'pending', 'excecao:' || p_id::text);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES (CASE WHEN p_decisao = 'aprovada' THEN 'aprovar_excecao' ELSE 'rejeitar_excecao' END, 'excecoes', p_id::text,
          COALESCE(v_email, 'sistema'),
          format('Exceção (%s) %s para %s%s', COALESCE(v_e.tipo_excecao, 'acesso'), p_decisao, COALESCE(v_e.colaborador_nome, '—'),
                 CASE WHEN p_comentario IS NOT NULL THEN ': ' || p_comentario ELSE '' END),
          jsonb_build_object('comentario', p_comentario, 'perfil_id', v_e.perfil_id, 'enfileirados', v_q));
  RETURN jsonb_build_object('ok', true, 'enfileirados', v_q, 'solicitante', v_e.solicitante);
END;
$$;
REVOKE ALL ON FUNCTION public.excecao_decidir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excecao_decidir(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Cadastro manual de colaborador — criação/edição com ciclo de vida completo
--     (antes: ~10 escritas no navegador, senha fixa no payload, evento duplicado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.colaborador_salvar(p_id uuid, p_dados jsonb, p_operador text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_op      text;
  v_old     colaboradores%ROWTYPE;
  v_id      uuid := p_id;
  v_nome    text := NULLIF(trim(p_dados->>'nome'), '');
  v_email   text := NULLIF(lower(trim(p_dados->>'email')), '');
  v_sam     text := NULLIF(trim(p_dados->>'sam_account_name'), '');
  v_status  text := COALESCE(NULLIF(p_dados->>'status',''), 'ativo');
  v_cargo   uuid := NULLIF(p_dados->>'cargo_id','')::uuid;
  v_area    uuid := NULLIF(p_dados->>'area_id','')::uuid;
  v_emp     uuid := NULLIF(p_dados->>'empresa_id','')::uuid;
  v_loc     uuid := NULLIF(p_dados->>'localidade_id','')::uuid;
  v_gestor  uuid := NULLIF(p_dados->>'gestor_id','')::uuid;
  v_adm     date := NULLIF(p_dados->>'data_admissao','')::date;
  v_upn_dom text := COALESCE(public.iam_param('ad_upn_dominio', 'ebessolar.local'), 'ebessolar.local');
  v_ident   jsonb;
  v_res     jsonb := '{}'::jsonb;
  v_r       jsonb;
  v_changed text[] := '{}';
  v_newvals jsonb := '{}'::jsonb;
  v_parts   text[];
  v_start   timestamptz := now();  -- created_at usa now() (início da transação)
  v_criado  boolean := (p_id IS NULL);
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = v_uid;
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nome é obrigatório'); END IF;
  IF v_status NOT IN ('ativo','inativo','ferias','afastado','desligado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || v_status);
  END IF;

  IF v_criado THEN
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(email) = v_email) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um colaborador com este e-mail');
    END IF;
    IF v_sam IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(sam_account_name) = lower(v_sam)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um colaborador com este login AD');
    END IF;
    INSERT INTO public.colaboradores (nome, email, cpf, matricula, sam_account_name, status, empresa_id, area_id, cargo_id, localidade_id, gestor_id, data_admissao, origem)
    VALUES (v_nome, v_email, NULLIF(trim(p_dados->>'cpf'),''), NULLIF(trim(p_dados->>'matricula'),''), v_sam, v_status::status_colaborador,
            v_emp, v_area, v_cargo, v_loc, v_gestor, v_adm, 'manual')
    RETURNING id INTO v_id;
    v_ident := public.iam_identity(v_id, NULL);

    INSERT INTO public.eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_depois)
    VALUES ('joiner', 'executado', v_id, v_nome, 'manual',
            jsonb_build_object('cargo_id', v_cargo, 'area_id', v_area, 'empresa_id', v_emp, 'status', v_status, 'operador', v_op));

    -- conta AD (o agente define a senha inicial; nada de senha no payload)
    IF v_status = 'ativo' AND v_sam IS NOT NULL THEN
      v_parts := regexp_split_to_array(v_nome, '\s+');
      PERFORM public.iam_queue_insert(v_ident, 'create',
        jsonb_build_object('givenName', v_parts[1], 'surname', COALESCE(NULLIF(array_to_string(v_parts[2:], ' '), ''), v_parts[1]),
                           'userPrincipalName', v_sam || '@' || v_upn_dom, 'employeeID', NULLIF(trim(p_dados->>'matricula'),''),
                           'department', (SELECT nome FROM public.areas WHERE id = v_area),
                           'title', (SELECT nome FROM public.cargos WHERE id = v_cargo),
                           'company', (SELECT nome FROM public.empresas WHERE id = v_emp),
                           'changePasswordAtLogon', true, 'reason', 'joiner_manual'),
        'ad_account:' || v_sam, v_op, 'pending');
      v_res := v_res || jsonb_build_object('conta_enfileirada', true);
    END IF;

    -- cargo: materializa perfis e enfileira os acessos com carência para a replicação AD → Entra
    IF v_cargo IS NOT NULL THEN
      -- cargo já gravado no INSERT: sem evento "mover", só materializa perfis + enfileira
      v_r := public.jml_alterar_cargo(v_id, v_cargo, v_op, 'manual', NULL, false);
      IF v_status = 'ativo' AND v_sam IS NOT NULL THEN
        UPDATE public.iam_queue SET next_retry_at = now() + interval '45 minutes', max_retries = GREATEST(COALESCE(max_retries, 10), 10)
         WHERE colaborador_id = v_id AND status = 'pending' AND action_type LIKE 'assign\_%' AND created_at >= v_start;
      END IF;
      v_res := v_res || jsonb_build_object('acessos_cargo', COALESCE((v_r->>'queued_assign')::int, 0));
    END IF;

    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('criar_colaborador', 'colaboradores', v_id::text, v_op, 'Criado: ' || v_nome,
            jsonb_build_object('email', v_email, 'sam', v_sam, 'cargo_id', v_cargo, 'status', v_status) || v_res);
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'criado', true) || v_res;
  END IF;

  -- ── edição ──
  SELECT * INTO v_old FROM public.colaboradores WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Colaborador não encontrado'); END IF;
  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.colaboradores WHERE lower(email) = v_email AND id <> p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe outro colaborador com este e-mail');
  END IF;

  UPDATE public.colaboradores
     SET nome = v_nome, email = v_email, cpf = NULLIF(trim(p_dados->>'cpf'),''), matricula = NULLIF(trim(p_dados->>'matricula'),''),
         sam_account_name = COALESCE(v_sam, sam_account_name), empresa_id = v_emp, area_id = v_area, localidade_id = v_loc,
         gestor_id = v_gestor, data_admissao = v_adm
   WHERE id = p_id;
  v_ident := public.iam_identity(p_id, NULL);

  -- mudança de cargo (mover) — provisiona/remove via delta
  IF v_old.cargo_id IS DISTINCT FROM v_cargo THEN
    IF v_cargo IS NULL THEN
      UPDATE public.colaboradores SET cargo_id = NULL WHERE id = p_id;
      UPDATE public.perfil_atribuicoes SET ativo = false, data_revogacao = now() WHERE colaborador_id = p_id AND origem = 'cargo' AND ativo;
    ELSE
      v_r := public.jml_alterar_cargo(p_id, v_cargo, v_op, 'manual', v_old.cargo_id, true);
      v_res := v_res || jsonb_build_object('mover', v_r);
    END IF;
    v_changed := array_append(v_changed, 'title');
    v_newvals := v_newvals || jsonb_build_object('title', (SELECT nome FROM public.cargos WHERE id = v_cargo));
  END IF;
  IF v_old.area_id IS DISTINCT FROM v_area THEN
    v_changed := array_append(v_changed, 'department');
    v_newvals := v_newvals || jsonb_build_object('department', (SELECT nome FROM public.areas WHERE id = v_area));
    IF v_old.cargo_id IS NOT DISTINCT FROM v_cargo THEN
      INSERT INTO public.eventos_jml (tipo, status, colaborador_id, colaborador_nome, origem, dados_antes, dados_depois)
      VALUES ('mover', 'executado', p_id, v_nome, 'manual',
              jsonb_build_object('area_id', v_old.area_id, 'area', (SELECT nome FROM public.areas WHERE id = v_old.area_id)),
              jsonb_build_object('area_id', v_area, 'area', (SELECT nome FROM public.areas WHERE id = v_area), 'operador', v_op));
    END IF;
  END IF;
  IF v_old.empresa_id IS DISTINCT FROM v_emp THEN
    v_changed := array_append(v_changed, 'company');
    v_newvals := v_newvals || jsonb_build_object('company', (SELECT nome FROM public.empresas WHERE id = v_emp));
  END IF;
  IF v_old.nome IS DISTINCT FROM v_nome THEN
    v_changed := array_append(v_changed, 'displayName');
    v_newvals := v_newvals || jsonb_build_object('displayName', v_nome);
  END IF;

  -- atributos no diretório (só quando a conta continua/fica ativa)
  IF array_length(v_changed, 1) > 0 AND v_status NOT IN ('desligado', 'inativo') AND (v_ident->>'sam' IS NOT NULL OR v_ident->>'email' IS NOT NULL) THEN
    IF v_ident->>'sam' IS NOT NULL THEN
      PERFORM public.iam_queue_insert(v_ident, 'update',
        jsonb_build_object('status', 'enabled', 'changed_fields', to_jsonb(v_changed), 'new_values', v_newvals, 'reason', 'atualizacao_cadastral'),
        'ad_attrs:' || (v_ident->>'sam') || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
    END IF;
    PERFORM public.iam_queue_insert(v_ident, 'update_entra',
      jsonb_build_object('department', v_newvals->>'department', 'jobTitle', v_newvals->>'title', 'companyName', v_newvals->>'company',
                         'displayName', v_newvals->>'displayName', 'reason', 'atualizacao_cadastral'),
      'entra_attrs:' || (v_ident->>'target_identity') || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
    v_res := v_res || jsonb_build_object('atributos_enfileirados', true, 'campos', to_jsonb(v_changed));
  END IF;

  -- mudança de status (leaver / soft / reativação) — RPC transacional
  IF v_old.status::text IS DISTINCT FROM v_status THEN
    v_r := public.jml_alterar_status(p_id, v_status, v_op, 'manual', NULLIF(p_dados->>'motivo',''), false);
    IF COALESCE((v_r->>'ok')::boolean, false) = false THEN
      RAISE EXCEPTION '%', COALESCE(v_r->>'error', 'Falha ao alterar status');
    END IF;
    v_res := v_res || jsonb_build_object('status', v_r);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
  VALUES ('editar_colaborador', 'colaboradores', p_id::text, v_op, 'Editado: ' || v_nome,
          jsonb_build_object('campos_diretorio', to_jsonb(v_changed), 'status_anterior', v_old.status, 'status_novo', v_status,
                             'cargo_anterior', v_old.cargo_id, 'cargo_novo', v_cargo));
  RETURN jsonb_build_object('ok', true, 'id', p_id, 'criado', false) || v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.colaborador_salvar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colaborador_salvar(uuid, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Cadastro de terceiro — criação/edição; ativo/inativo via terceiro_alterar_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terceiro_salvar(p_id uuid, p_dados jsonb, p_operador text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_op    text;
  v_old   terceiros%ROWTYPE;
  v_id    uuid := p_id;
  v_nome  text := NULLIF(trim(p_dados->>'nome'), '');
  v_email text := NULLIF(lower(trim(p_dados->>'email')), '');
  v_sam   text := NULLIF(trim(p_dados->>'sam_account_name'), '');
  v_emp   text := NULLIF(trim(p_dados->>'empresa_terceira'), '');
  v_ativo boolean := COALESCE((p_dados->>'ativo')::boolean, true);
  v_upn_dom text := COALESCE(public.iam_param('ad_upn_dominio', 'ebessolar.local'), 'ebessolar.local');
  v_ident jsonb;
  v_parts text[];
  v_r     jsonb;
  v_res   jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.iam_assert_operator();
  SELECT COALESCE(p_operador, email) INTO v_op FROM public.profiles WHERE id = v_uid;
  v_op := COALESCE(v_op, p_operador, 'sistema');
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nome é obrigatório'); END IF;
  IF v_emp IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Empresa é obrigatória'); END IF;

  IF p_id IS NULL THEN
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.terceiros WHERE lower(email) = v_email) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Já existe um terceiro com este e-mail');
    END IF;
    INSERT INTO public.terceiros (nome, email, empresa_terceira, contrato_inicio, contrato_fim, criticidade, responsavel, responsavel_colaborador_id, ativo, sam_account_name)
    VALUES (v_nome, v_email, v_emp, NULLIF(p_dados->>'contrato_inicio','')::date, NULLIF(p_dados->>'contrato_fim','')::date,
            COALESCE(NULLIF(p_dados->>'criticidade',''), 'media')::criticidade, NULLIF(trim(p_dados->>'responsavel'),''),
            NULLIF(p_dados->>'responsavel_colaborador_id','')::uuid, v_ativo, v_sam)
    RETURNING id INTO v_id;
    v_ident := public.iam_identity(NULL, v_id);
    INSERT INTO public.eventos_jml (tipo, status, terceiro_id, colaborador_nome, origem, dados_antes, dados_depois)
    VALUES ('joiner', 'executado', v_id, v_nome, 'manual', jsonb_build_object('terceiro_id', v_id),
            jsonb_build_object('empresa', v_emp, 'contrato_fim', p_dados->>'contrato_fim', 'ativo', v_ativo, 'operador', v_op));
    IF v_ativo AND v_sam IS NOT NULL THEN
      v_parts := regexp_split_to_array(v_nome, '\s+');
      PERFORM public.iam_queue_insert(v_ident, 'create',
        jsonb_build_object('givenName', v_parts[1], 'surname', COALESCE(NULLIF(array_to_string(v_parts[2:], ' '), ''), v_parts[1]),
                           'userPrincipalName', v_sam || '@' || v_upn_dom, 'title', 'Terceiro', 'company', v_emp,
                           'changePasswordAtLogon', true, 'reason', 'joiner_terceiro',
                           'accountExpires', p_dados->>'contrato_fim'),
        'ad_account:' || v_sam, v_op, 'pending');
      v_res := v_res || jsonb_build_object('conta_enfileirada', true);
    END IF;
    INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo, detalhes)
    VALUES ('criar_terceiro', 'terceiros', v_id::text, v_op, 'Criado: ' || v_nome, jsonb_build_object('empresa', v_emp, 'sam', v_sam) || v_res);
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'criado', true) || v_res;
  END IF;

  SELECT * INTO v_old FROM public.terceiros WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Terceiro não encontrado'); END IF;
  UPDATE public.terceiros
     SET nome = v_nome, email = v_email, empresa_terceira = v_emp,
         contrato_inicio = NULLIF(p_dados->>'contrato_inicio','')::date, contrato_fim = NULLIF(p_dados->>'contrato_fim','')::date,
         criticidade = COALESCE(NULLIF(p_dados->>'criticidade',''), criticidade::text)::criticidade,
         responsavel = NULLIF(trim(p_dados->>'responsavel'),''), responsavel_colaborador_id = NULLIF(p_dados->>'responsavel_colaborador_id','')::uuid,
         sam_account_name = COALESCE(v_sam, sam_account_name)
   WHERE id = p_id;

  -- prorrogação/antecipação de contrato reflete no AD (accountExpires)
  IF v_old.contrato_fim IS DISTINCT FROM NULLIF(p_dados->>'contrato_fim','')::date AND COALESCE(v_sam, v_old.sam_account_name) IS NOT NULL AND v_ativo THEN
    v_ident := public.iam_identity(NULL, p_id);
    PERFORM public.iam_queue_insert(v_ident, 'update',
      jsonb_build_object('status', 'enabled', 'changed_fields', jsonb_build_array('accountExpires'),
                         'new_values', jsonb_build_object('accountExpires', p_dados->>'contrato_fim'), 'reason', 'contrato_alterado'),
      'ad_attrs:' || COALESCE(v_sam, v_old.sam_account_name) || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), v_op, 'pending');
  END IF;

  IF v_old.ativo IS DISTINCT FROM v_ativo THEN
    v_r := public.terceiro_alterar_status(p_id, v_ativo, v_op, 'manual', NULLIF(p_dados->>'motivo',''));
    IF COALESCE((v_r->>'ok')::boolean, false) = false THEN RAISE EXCEPTION '%', COALESCE(v_r->>'error', 'Falha ao alterar status'); END IF;
    v_res := v_res || jsonb_build_object('status', v_r);
  END IF;

  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('editar_terceiro', 'terceiros', p_id::text, v_op, 'Editado: ' || v_nome);
  RETURN jsonb_build_object('ok', true, 'id', p_id, 'criado', false) || v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.terceiro_salvar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terceiro_salvar(uuid, jsonb, text) TO authenticated, service_role;

-- terceiros nunca são apagados: "excluir" = desligar (mesma política dos colaboradores)
CREATE OR REPLACE FUNCTION public.terceiros_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('origo.allow_hard_delete', true), '') = 'on' THEN RETURN OLD; END IF;
  IF OLD.ativo THEN
    PERFORM public.terceiro_alterar_status(OLD.id, false, COALESCE(auth.jwt() ->> 'email', current_user), 'manual', 'Exclusão solicitada na ferramenta');
  END IF;
  INSERT INTO public.auditoria (acao, entidade, entidade_id, operador, resumo)
  VALUES ('delete_convertido_em_desligamento', 'terceiros', OLD.id::text, COALESCE(auth.jwt() ->> 'email', current_user),
          format('Tentativa de exclusão de %s convertida em desligamento (identidades são preservadas para auditoria).', OLD.nome));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_terceiros_soft_delete ON public.terceiros;
CREATE TRIGGER trg_terceiros_soft_delete BEFORE DELETE ON public.terceiros
  FOR EACH ROW EXECUTE FUNCTION public.terceiros_soft_delete();

-- ---------------------------------------------------------------------------
-- 12. Fila: reprocessar todas as falhas; estatísticas sem limite de linhas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iam_queue_reprocessar_falhas(p_action_types text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_n int; v_email text;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')) THEN
    RAISE EXCEPTION 'Acesso negado: requer papel admin ou operador';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  UPDATE public.iam_queue
     SET status = 'pending', error_code = NULL, result_message = NULL, next_retry_at = NULL, retry_count = 0
   WHERE status = 'failed' AND (p_action_types IS NULL OR action_type = ANY (p_action_types));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    INSERT INTO public.auditoria (acao, entidade, operador, resumo)
    VALUES ('reprocessar_falhas', 'iam_queue', COALESCE(v_email, v_uid::text), format('%s item(ns) com falha devolvidos à fila', v_n));
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.iam_queue_reprocessar_falhas(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_reprocessar_falhas(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.iam_queue_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending',          count(*) FILTER (WHERE status = 'pending'),
    'waiting_approval', count(*) FILTER (WHERE status = 'waiting_approval'),
    'processing',       count(*) FILTER (WHERE status = 'processing'),
    'failed',           count(*) FILTER (WHERE status = 'failed'),
    'success_7d',       count(*) FILTER (WHERE status = 'success'   AND COALESCE(processed_at, created_at) >= now() - interval '7 days'),
    'cancelled_7d',     count(*) FILTER (WHERE status IN ('cancelled','rejected') AND COALESCE(processed_at, created_at) >= now() - interval '7 days'),
    'total',            count(*),
    'oldest_pending',   min(created_at) FILTER (WHERE status = 'pending'),
    'retry_scheduled',  count(*) FILTER (WHERE status = 'pending' AND next_retry_at > now()))
  FROM public.iam_queue;
$$;
REVOKE ALL ON FUNCTION public.iam_queue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_queue_stats() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. Métricas do dashboard em uma única chamada (invalidada via realtime)
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

  -- pessoas
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

  -- fila
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

  -- falhas por código (7d)
  SELECT v || jsonb_build_object('fila_falhas_por_codigo', COALESCE(jsonb_agg(jsonb_build_object('codigo', codigo, 'total', total) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT COALESCE(error_code, 'sem_codigo') AS codigo, count(*) AS total FROM iam_queue
           WHERE status = 'failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 6) f;

  -- ações por tipo (7d)
  SELECT v || jsonb_build_object('fila_por_acao_7d', COALESCE(jsonb_agg(jsonb_build_object('acao', action_type, 'total', total, 'sucesso', ok, 'falha', ko) ORDER BY total DESC), '[]'::jsonb))
    INTO v
    FROM (SELECT action_type, count(*) AS total, count(*) FILTER (WHERE status = 'success') AS ok, count(*) FILTER (WHERE status = 'failed') AS ko
            FROM iam_queue WHERE created_at >= now() - interval '7 days' AND status <> 'cancelled' GROUP BY 1 ORDER BY 2 DESC LIMIT 10) a;

  -- governança
  SELECT v || jsonb_build_object(
    'solic_pendentes',   (SELECT count(*) FROM solicitacoes_acesso WHERE status IN ('pendente','em_aprovacao')),
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

  -- conflitos SoD ativos (pessoas com os dois perfis de um conflito ativo)
  SELECT count(*) INTO v_sod
    FROM sod_conflitos s
    JOIN perfil_atribuicoes a ON a.perfil_id = s.perfil_a_id AND a.ativo
    JOIN perfil_atribuicoes b ON b.perfil_id = s.perfil_b_id AND b.ativo
     AND ((a.colaborador_id IS NOT NULL AND a.colaborador_id = b.colaborador_id) OR (a.terceiro_id IS NOT NULL AND a.terceiro_id = b.terceiro_id))
   WHERE s.ativo;
  v := v || jsonb_build_object('sod_violacoes', v_sod);

  -- licenças críticas
  SELECT v || jsonb_build_object(
    'licencas_criticas', count(*) FILTER (WHERE total > 0 AND NOT COALESCE(is_trial,false) AND em_uso::numeric / total * 100 >= COALESCE(public.iam_param('licenca_critico_pct','90')::numeric, 90)),
    'licencas_total_seats', COALESCE(sum(total) FILTER (WHERE NOT COALESCE(is_trial,false)), 0),
    'licencas_em_uso',   COALESCE(sum(em_uso) FILTER (WHERE NOT COALESCE(is_trial,false)), 0))
  INTO v FROM entra_licencas;

  -- agente / ciclo diário
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

-- séries temporais do dashboard (JML e fila por dia) em uma chamada
CREATE OR REPLACE FUNCTION public.dashboard_series(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dias AS (
    SELECT (current_date - (n || ' days')::interval)::date AS dia FROM generate_series(GREATEST(COALESCE(p_days, 30), 1) - 1, 0, -1) n
  ), fila AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(*) FILTER (WHERE action_type LIKE 'assign\_%' OR action_type IN ('create','create_if_not_exists','enable_entra','create_user_app')) AS concessoes,
           count(*) FILTER (WHERE action_type LIKE 'remove\_%' OR action_type IN ('disable','disable_entra','delete','disable_user_app','delete_user_app')) AS revogacoes,
           count(*) FILTER (WHERE NOT (action_type LIKE 'assign\_%' OR action_type LIKE 'remove\_%' OR action_type IN ('create','create_if_not_exists','enable_entra','create_user_app','disable','disable_entra','delete','disable_user_app','delete_user_app'))) AS outros,
           count(*) FILTER (WHERE status = 'failed') AS falhas
      FROM iam_queue
     WHERE created_at >= current_date - GREATEST(COALESCE(p_days, 30), 1) AND status <> 'cancelled'
     GROUP BY 1
  ), jml AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'joiner') AS joiners,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'mover') AS movers,
           count(DISTINCT COALESCE(colaborador_id::text, terceiro_id::text, colaborador_nome)) FILTER (WHERE tipo = 'leaver') AS leavers,
           count(*) FILTER (WHERE tipo IN ('pre_leaver')) AS pre_leavers
      FROM eventos_jml
     WHERE created_at >= current_date - GREATEST(COALESCE(p_days, 30), 1)
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'dia', d.dia, 'concessoes', COALESCE(f.concessoes, 0), 'revogacoes', COALESCE(f.revogacoes, 0), 'outros', COALESCE(f.outros, 0), 'falhas', COALESCE(f.falhas, 0),
           'joiners', COALESCE(j.joiners, 0), 'movers', COALESCE(j.movers, 0), 'leavers', COALESCE(j.leavers, 0), 'pre_leavers', COALESCE(j.pre_leavers, 0)) ORDER BY d.dia)
    FROM dias d LEFT JOIN fila f ON f.dia = d.dia LEFT JOIN jml j ON j.dia = d.dia;
$$;
REVOKE ALL ON FUNCTION public.dashboard_series(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_series(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Eventos JML são um LOG: status legado só informativo — normaliza o que sobrou
-- ---------------------------------------------------------------------------
UPDATE public.eventos_jml SET status = 'executado' WHERE status IN ('executando', 'quarentena');
-- <<<<<<<<<<<<<<<<<<<<<< 20260918100000_hermes_unico_executor.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260918110000_remove_solicitacoes_workflow.sql >>>>>>>>>>>>>>>>>>>>>>
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
-- <<<<<<<<<<<<<<<<<<<<<< 20260918110000_remove_solicitacoes_workflow.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260918120000_revisoes_completas.sql >>>>>>>>>>>>>>>>>>>>>>
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
-- <<<<<<<<<<<<<<<<<<<<<< 20260918120000_revisoes_completas.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260918130000_terceiros_revalidacao_atividade.sql >>>>>>>>>>>>>>>>>>>>>>
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
-- <<<<<<<<<<<<<<<<<<<<<< 20260918130000_terceiros_revalidacao_atividade.sql <<<<<<<<<<<<<<<<<<<<<<


-- >>>>>>>>>>>>>>>>>>>>>> 20260918140000_admin_usuarios_atividade_pessoa.sql >>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 2026-09-18 — Gestão de usuários do painel + atividade por pessoa
--
-- 1. profiles: admins podiam ler, mas NÃO editar/desativar outros usuários (só a
--    própria linha) — o painel mostrava "Usuário desativado" e nada mudava.
--    Política de UPDATE para admin (hierárquica: platform_admin ⊇ admin).
--    A gestão em si (criar, editar, desativar/reativar com bloqueio no Auth,
--    excluir, redefinir senha) passa pela edge function `admin-users`.
-- 2. admin_usuarios_resumo(): lista para o painel com papel, último acesso e
--    bloqueio (auth.users não é legível pelo cliente).
-- 3. dashboard_activity: filtro por pessoa (colaborador ou terceiro) para a
--    aba "Atividade" das páginas de detalhe.
-- Tudo idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS: admin edita qualquer perfil do painel
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Lista de usuários do painel (admin): perfil + papel + dados do Auth
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usuarios_resumo()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.has_role(auth.uid(), 'admin') THEN '[]'::jsonb ELSE (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'email', p.email, 'ativo', p.ativo, 'avatar_url', p.avatar_url,
      'must_change_password', p.must_change_password, 'created_at', p.created_at,
      'role', COALESCE((SELECT r.role::text FROM public.user_roles r WHERE r.user_id = p.id
                        ORDER BY CASE r.role::text WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'operador' THEN 2 ELSE 3 END LIMIT 1), 'viewer'),
      'last_sign_in_at', u.last_sign_in_at, 'email_confirmed_at', u.email_confirmed_at,
      'banned_until', u.banned_until, 'bloqueado', u.banned_until IS NOT NULL AND u.banned_until > now(),
      'auditoria_30d', (SELECT count(*) FROM public.auditoria a WHERE a.operador = p.email AND a."timestamp" >= now() - interval '30 days')
    ) ORDER BY p.nome), '[]'::jsonb)
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
  ) END;
$$;
REVOKE ALL ON FUNCTION public.admin_usuarios_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usuarios_resumo() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. dashboard_activity com filtro por pessoa
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dashboard_activity(integer, text);
CREATE OR REPLACE FUNCTION public.dashboard_activity(p_limit integer DEFAULT 40, p_categoria text DEFAULT NULL, p_colaborador_id uuid DEFAULT NULL, p_terceiro_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200) AS n),
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
     WHERE (q.status::text <> 'cancelled' OR q.processed_at >= now() - interval '1 day')
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
     WHERE (p_colaborador_id IS NULL OR e.colaborador_id = p_colaborador_id)
       AND (p_terceiro_id IS NULL OR e.terceiro_id = p_terceiro_id)
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
     WHERE a.acao NOT IN ('email_revisao', 'enviar_email', 'cron_invoke')
       AND ((SELECT id FROM pid) IS NULL
            OR a.entidade_id = (SELECT id FROM pid)
            OR a.detalhes->>'pessoa_id' = (SELECT id FROM pid)
            OR a.detalhes->>'colaborador_id' = (SELECT id FROM pid)
            OR a.detalhes->>'terceiro_id' = (SELECT id FROM pid))
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
REVOKE ALL ON FUNCTION public.dashboard_activity(integer, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity(integer, text, uuid, uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS ix_auditoria_entidade_id ON public.auditoria (entidade_id);

NOTIFY pgrst, 'reload schema';
-- <<<<<<<<<<<<<<<<<<<<<< 20260918140000_admin_usuarios_atividade_pessoa.sql <<<<<<<<<<<<<<<<<<<<<<


-- registra as versões para o Lovable/CLI não reaplicarem
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260806141300', 'reconstruct_manual_objects') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120000', 'iga_queue_state_machine') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120100', 'iga_effective_access_rpcs') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120200', 'iga_jml_rpcs') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120300', 'iga_security_hardening') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120400', 'iga_identity_constraints') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120500', 'iga_cleanup_dead_objects') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120600', 'iga_scheduling') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260917120700', 'iga_integration_params') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918100000', 'hermes_unico_executor') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918110000', 'remove_solicitacoes_workflow') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918120000', 'revisoes_completas') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918130000', 'terceiros_revalidacao_atividade') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260918140000', 'admin_usuarios_atividade_pessoa') ON CONFLICT (version) DO NOTHING;
NOTIFY pgrst, 'reload schema';
