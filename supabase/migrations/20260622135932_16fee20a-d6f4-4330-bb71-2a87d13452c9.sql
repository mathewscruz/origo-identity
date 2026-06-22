
ALTER TABLE public.perfil_atribuicoes ADD COLUMN IF NOT EXISTS excecao_id uuid REFERENCES public.excecoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_perfil_atribuicoes_excecao ON public.perfil_atribuicoes(excecao_id);

ALTER TABLE public.revisao_itens ADD COLUMN IF NOT EXISTS terceiro_id uuid REFERENCES public.terceiros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_revisao_itens_terceiro ON public.revisao_itens(terceiro_id);
