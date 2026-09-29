-- Corrige ambientes legados onde iam_queue.claim_token já existia como text.
-- O claim/lease usa UUID nativo; a conversão preserva UUIDs válidos e NULLs.
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
    INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'iam_queue'
    AND c.column_name = 'claim_token';

  IF v_data_type IS NULL THEN
    ALTER TABLE public.iam_queue ADD COLUMN claim_token uuid;
  ELSIF v_data_type IN ('text', 'character varying') THEN
    IF EXISTS (
      SELECT 1
      FROM public.iam_queue
      WHERE claim_token IS NOT NULL
        AND btrim(claim_token::text) <> ''
        AND claim_token::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION 'claim_token_contains_non_uuid_values';
    END IF;

    ALTER TABLE public.iam_queue
      ALTER COLUMN claim_token TYPE uuid
      USING NULLIF(btrim(claim_token::text), '')::uuid;
  ELSIF v_data_type <> 'uuid' THEN
    RAISE EXCEPTION 'unsupported_claim_token_type:%', v_data_type;
  END IF;
END
$$;

-- Read-back obrigatório: deve retornar data_type = uuid e zero tokens inválidos.
SELECT json_build_object(
  'status', CASE WHEN c.data_type = 'uuid' THEN 'committed' ELSE 'invalid' END,
  'claim_token_data_type', c.data_type,
  'migration', '20260928195900'
) AS claim_token_fix_readback
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'iam_queue'
  AND c.column_name = 'claim_token';
