CREATE OR REPLACE FUNCTION public.iam_queue_validate_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_ok        boolean := false;
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

  IF OLD.status = 'waiting_approval' AND NEW.status = 'pending' THEN
    IF v_uid IS NOT NULL THEN
      NEW.approved_by := v_uid;
    END IF;
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'Aprovação exige approved_by (item %)', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.retry_count   := 0;
    NEW.next_retry_at := NULL;
    NEW.rejection_reason := NULL;
  END IF;

  IF NEW.status = 'rejected' AND v_uid IS NOT NULL THEN
    NEW.approved_by := v_uid;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  IF OLD.status = 'processing' AND NEW.status <> 'processing' THEN
    NEW.claim_token      := NULL;
    NEW.lease_expires_at := NULL;
  END IF;

  IF NEW.status IN ('success','failed','cancelled','rejected') THEN
    NEW.processed_at := COALESCE(NEW.processed_at, now());
  END IF;

  RETURN NEW;
END;
$function$;