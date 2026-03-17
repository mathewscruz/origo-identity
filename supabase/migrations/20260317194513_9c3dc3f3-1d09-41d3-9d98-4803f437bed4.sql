
-- Add entra_id column to colaboradores for Microsoft Entra ID sync
ALTER TABLE public.colaboradores ADD COLUMN entra_id text UNIQUE;

-- Add entra_id column to aplicacoes for Microsoft Entra ID sync
ALTER TABLE public.aplicacoes ADD COLUMN entra_id text UNIQUE;
