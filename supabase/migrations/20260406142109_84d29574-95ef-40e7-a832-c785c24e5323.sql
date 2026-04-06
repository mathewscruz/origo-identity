ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 10;