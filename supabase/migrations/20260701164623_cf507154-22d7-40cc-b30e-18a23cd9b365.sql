
-- Indexes for iam_queue hot paths
CREATE INDEX IF NOT EXISTS ix_iam_queue_status_action ON public.iam_queue(status, action_type);
CREATE INDEX IF NOT EXISTS ix_iam_queue_status_created ON public.iam_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_iam_queue_colab_action_status ON public.iam_queue(colaborador_id, action_type, status);

-- Distinct action_type + requested_by helper for the approval filter dropdowns
CREATE OR REPLACE FUNCTION public.iam_queue_distinct_actions_origins(status_filter text[])
RETURNS TABLE(action_type text, requested_by text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT q.action_type::text, q.requested_by::text
  FROM public.iam_queue q
  WHERE q.status = ANY(status_filter)
$$;

GRANT EXECUTE ON FUNCTION public.iam_queue_distinct_actions_origins(text[]) TO authenticated, service_role;

-- Batch update helper for the reconcile job:
--   queue_updates : jsonb array of { id: uuid, colaborador_id: uuid }
--   colab_updates : jsonb array of { id: uuid, entra_id: text }
CREATE OR REPLACE FUNCTION public.apply_reconcile_updates(
  queue_updates jsonb DEFAULT '[]'::jsonb,
  colab_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queue_touched int := 0;
  colab_touched int := 0;
BEGIN
  IF jsonb_array_length(queue_updates) > 0 THEN
    WITH src AS (
      SELECT * FROM jsonb_to_recordset(queue_updates) AS x(id uuid, colaborador_id uuid)
    )
    UPDATE public.iam_queue q
       SET colaborador_id = src.colaborador_id
      FROM src
     WHERE q.id = src.id;
    GET DIAGNOSTICS queue_touched = ROW_COUNT;
  END IF;

  IF jsonb_array_length(colab_updates) > 0 THEN
    WITH src AS (
      SELECT * FROM jsonb_to_recordset(colab_updates) AS x(id uuid, entra_id text)
    )
    UPDATE public.colaboradores c
       SET entra_id = src.entra_id
      FROM src
     WHERE c.id = src.id;
    GET DIAGNOSTICS colab_touched = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('queue_updated', queue_touched, 'colab_updated', colab_touched);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) TO service_role;
