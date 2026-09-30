-- Idempotência forte da importação RH/SharePoint por conteúdo da fonte.
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS source_sha256 text,
  ADD COLUMN IF NOT EXISTS source_item_id text,
  ADD COLUMN IF NOT EXISTS source_modified_at timestamptz;

ALTER TABLE public.sync_jobs
  DROP CONSTRAINT IF EXISTS sync_jobs_source_sha256_format;
ALTER TABLE public.sync_jobs
  ADD CONSTRAINT sync_jobs_source_sha256_format
  CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS sync_jobs_csv_source_active_done_uidx
  ON public.sync_jobs (tipo, source_sha256)
  WHERE source_sha256 IS NOT NULL
    AND status IN ('running', 'done');

CREATE INDEX IF NOT EXISTS sync_jobs_source_sha256_idx
  ON public.sync_jobs (source_sha256, created_at DESC)
  WHERE source_sha256 IS NOT NULL;

COMMENT ON COLUMN public.sync_jobs.source_sha256 IS
  'SHA-256 do arquivo fonte; impede processamento concorrente/repetido do mesmo conteúdo.';
COMMENT ON COLUMN public.sync_jobs.source_item_id IS
  'ID imutável do item SharePoint usado como fonte.';
COMMENT ON COLUMN public.sync_jobs.source_modified_at IS
  'lastModifiedDateTime informado pelo SharePoint para auditoria.';
