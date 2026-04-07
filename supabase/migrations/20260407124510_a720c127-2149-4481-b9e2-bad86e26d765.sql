
ALTER TABLE public.aplicacoes ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.aplicacoes ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS aplicacoes_entra_id_unique ON public.aplicacoes (entra_id) WHERE entra_id IS NOT NULL;
