
-- 1. Create many-to-many join table
CREATE TABLE public.perfil_aplicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  aplicacao_id uuid NOT NULL REFERENCES aplicacoes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(perfil_id, aplicacao_id)
);

-- 2. Enable RLS
ALTER TABLE public.perfil_aplicacoes ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies following existing pattern
CREATE POLICY "Authenticated can select perfil_aplicacoes" ON public.perfil_aplicacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select perfil_aplicacoes" ON public.perfil_aplicacoes FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert perfil_aplicacoes" ON public.perfil_aplicacoes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update perfil_aplicacoes" ON public.perfil_aplicacoes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete perfil_aplicacoes" ON public.perfil_aplicacoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Migrate existing data from perfis_acesso.aplicacao_id to new table
INSERT INTO public.perfil_aplicacoes (perfil_id, aplicacao_id)
SELECT id, aplicacao_id FROM public.perfis_acesso WHERE aplicacao_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Drop old column and sensibilidade
ALTER TABLE public.perfis_acesso DROP COLUMN IF EXISTS aplicacao_id;
ALTER TABLE public.perfis_acesso DROP COLUMN IF EXISTS sensibilidade;
