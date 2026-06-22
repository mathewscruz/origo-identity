ALTER TABLE public.terceiros
  ADD COLUMN IF NOT EXISTS responsavel_colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_terceiros_responsavel_colaborador_id
  ON public.terceiros(responsavel_colaborador_id);