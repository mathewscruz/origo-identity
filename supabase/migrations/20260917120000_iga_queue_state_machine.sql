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
