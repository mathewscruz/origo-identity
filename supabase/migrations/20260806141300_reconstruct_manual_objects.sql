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
