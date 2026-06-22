ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS desligado_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS desligado_manual_em timestamptz,
  ADD COLUMN IF NOT EXISTS desligado_manual_por text;

CREATE INDEX IF NOT EXISTS idx_colab_desligado_manual
  ON public.colaboradores (desligado_manual) WHERE desligado_manual = true;