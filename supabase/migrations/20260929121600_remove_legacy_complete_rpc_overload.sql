-- Remove a sobrecarga legada que torna a conclusão de lease ambígua no PostgREST.
-- A RPC suportada usa p_claim_token uuid e seis parâmetros.

DROP FUNCTION IF EXISTS public.complete_iam_queue_item(
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  integer,
  text
);

REVOKE ALL ON FUNCTION public.complete_iam_queue_item(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_iam_queue_item(uuid, uuid, text, text, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

WITH signatures AS (
  SELECT
    p.oid,
    pg_get_function_identity_arguments(p.oid) AS identity_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'complete_iam_queue_item'
), checks AS (
  SELECT
    count(*) FILTER (
      WHERE identity_args = 'p_id uuid, p_claim_token uuid, p_status text, p_result_message text, p_error_code text, p_processed_by text'
    ) AS uuid_signature_count,
    count(*) FILTER (
      WHERE identity_args LIKE '%p_claim_token text%'
    ) AS text_signature_count
  FROM signatures
)
SELECT json_build_object(
  'status', CASE
    WHEN uuid_signature_count = 1
     AND text_signature_count = 0
     AND has_function_privilege(
       'authenticated',
       'public.complete_iam_queue_item(uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
    THEN 'committed' ELSE 'invalid' END,
  'migration', '20260929121600',
  'uuid_signature_count', uuid_signature_count,
  'text_signature_count', text_signature_count,
  'complete_execute', has_function_privilege(
    'authenticated',
    'public.complete_iam_queue_item(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
) AS iam_complete_rpc_dedup_readback
FROM checks;
