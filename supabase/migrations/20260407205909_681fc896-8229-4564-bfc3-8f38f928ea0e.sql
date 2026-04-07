
ALTER TABLE public.solicitacoes_acesso ALTER COLUMN perfil_id DROP NOT NULL;
ALTER TABLE public.solicitacoes_acesso ADD COLUMN aplicacoes_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.solicitacoes_acesso ADD COLUMN grupos_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
