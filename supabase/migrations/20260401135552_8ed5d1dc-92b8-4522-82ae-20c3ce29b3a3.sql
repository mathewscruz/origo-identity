ALTER TABLE public.iam_queue
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_by text,
  ADD COLUMN IF NOT EXISTS target_identity text,
  ADD COLUMN IF NOT EXISTS error_code text;