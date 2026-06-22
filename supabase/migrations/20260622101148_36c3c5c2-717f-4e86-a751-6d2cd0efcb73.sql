
ALTER TYPE public.tipo_evento_jml ADD VALUE IF NOT EXISTS 'pre_leaver';
ALTER TYPE public.tipo_evento_jml ADD VALUE IF NOT EXISTS 'pre_leaver_revertido';

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS suspenso_preventivo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspenso_em timestamptz,
  ADD COLUMN IF NOT EXISTS suspenso_por text,
  ADD COLUMN IF NOT EXISTS suspenso_motivo text;

CREATE INDEX IF NOT EXISTS idx_colaboradores_suspenso_preventivo
  ON public.colaboradores (suspenso_preventivo) WHERE suspenso_preventivo = true;
