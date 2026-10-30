-- Forward-only evidence ledger for IAM queue transitions. No historical event times are invented.
-- This records IAM workflow, not independent confirmation of an AD/Entra/application change.
CREATE TABLE IF NOT EXISTS public.iam_access_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  queue_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE')),
  action_type text NOT NULL,
  status text NOT NULL,
  colaborador_id uuid,
  terceiro_id uuid,
  correlation_id text,
  resource_key text,
  requested_by text,
  processed_by text,
  authenticated_actor_id uuid,
  actor_attribution text NOT NULL CHECK (actor_attribution IN ('authenticated_session','unattributed_service')),
  approved_by uuid,
  approved_at timestamptz,
  queue_created_at timestamptz NOT NULL,
  processed_at timestamptz,
  source_kind text NOT NULL CHECK (source_kind IN ('entra_inventory','iam_workflow')),
  outcome_scope text NOT NULL CHECK (outcome_scope IN ('observation','request','queue_result_not_destination_proof'))
);
CREATE INDEX IF NOT EXISTS iam_access_evidence_person_colaborador_idx ON public.iam_access_evidence (colaborador_id,event_at DESC) WHERE colaborador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iam_access_evidence_person_terceiro_idx ON public.iam_access_evidence (terceiro_id,event_at DESC) WHERE terceiro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS iam_access_evidence_queue_idx ON public.iam_access_evidence (queue_id,event_at DESC);
CREATE INDEX IF NOT EXISTS iam_access_evidence_correlation_idx ON public.iam_access_evidence (correlation_id,event_at DESC) WHERE correlation_id IS NOT NULL;
ALTER TABLE public.iam_access_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iam_access_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.iam_access_evidence TO authenticated;
GRANT ALL ON public.iam_access_evidence TO service_role;
DROP POLICY IF EXISTS iam_access_evidence_read ON public.iam_access_evidence;
CREATE POLICY iam_access_evidence_read ON public.iam_access_evidence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operador'::public.app_role));

-- No UPDATE/DELETE even for service_role; no sensitive queue payload or result message is copied.
CREATE OR REPLACE FUNCTION public.iam_access_evidence_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 RAISE EXCEPTION 'iam_access_evidence is append-only' USING ERRCODE='insufficient_privilege';
END;
$fn$;
REVOKE ALL ON FUNCTION public.iam_access_evidence_immutable() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_iam_access_evidence_immutable ON public.iam_access_evidence;
CREATE TRIGGER trg_iam_access_evidence_immutable BEFORE UPDATE OR DELETE ON public.iam_access_evidence
 FOR EACH ROW EXECUTE FUNCTION public.iam_access_evidence_immutable();

CREATE OR REPLACE FUNCTION public.iam_queue_evidence_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_inventory boolean;
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.action_type,OLD.status,OLD.colaborador_id,OLD.terceiro_id,
   OLD.correlation_id,OLD.resource_key,OLD.requested_by,OLD.processed_by,
   OLD.approved_by,OLD.approved_at,OLD.processed_at,OLD.result_message)
 IS NOT DISTINCT FROM ROW(NEW.action_type,NEW.status,NEW.colaborador_id,NEW.terceiro_id,
   NEW.correlation_id,NEW.resource_key,NEW.requested_by,NEW.processed_by,
   NEW.approved_by,NEW.approved_at,NEW.processed_at,NEW.result_message) THEN
   RETURN NEW;
 END IF;
 v_inventory := public.iam_queue_observation_kind(NEW.requested_by,NEW.action_type,
    NEW.status,NEW.processed_by,NEW.result_message) IS NOT NULL;
 INSERT INTO public.iam_access_evidence
   (queue_id,operation,action_type,status,colaborador_id,terceiro_id,correlation_id,
    resource_key,requested_by,processed_by,authenticated_actor_id,actor_attribution,
    approved_by,approved_at,queue_created_at,
    processed_at,source_kind,outcome_scope)
 VALUES (NEW.id,TG_OP,NEW.action_type,NEW.status,NEW.colaborador_id,NEW.terceiro_id,
    NEW.correlation_id,NEW.resource_key,NEW.requested_by,NEW.processed_by,
    auth.uid(),CASE WHEN auth.uid() IS NULL THEN 'unattributed_service' ELSE 'authenticated_session' END,
    NEW.approved_by,NEW.approved_at,NEW.created_at,NEW.processed_at,
    CASE WHEN v_inventory THEN 'entra_inventory' ELSE 'iam_workflow' END,
    CASE WHEN v_inventory THEN 'observation'
         WHEN NEW.status IN ('success','failed') THEN 'queue_result_not_destination_proof'
         ELSE 'request' END);
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.iam_queue_evidence_capture() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_iam_queue_evidence_capture ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_evidence_capture AFTER INSERT OR UPDATE ON public.iam_queue
 FOR EACH ROW EXECUTE FUNCTION public.iam_queue_evidence_capture();
COMMENT ON TABLE public.iam_access_evidence IS 'Forward-only immutable IAM queue transition ledger; historical queue rows are not backfilled as events; destination system logs/readback remain separate evidence.';
NOTIFY pgrst,'reload schema';
