-- Add connector columns to aplicacoes
ALTER TABLE public.aplicacoes
  ADD COLUMN IF NOT EXISTS connector_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS connector_config jsonb;

-- Create aplicacao_perfis_internos table
CREATE TABLE IF NOT EXISTS public.aplicacao_perfis_internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id uuid NOT NULL REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  nome_externo text NOT NULL,
  external_id text,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create perfil_apps_internos table
CREATE TABLE IF NOT EXISTS public.perfil_apps_internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  aplicacao_id uuid NOT NULL REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  perfil_interno_id uuid NOT NULL REFERENCES public.aplicacao_perfis_internos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(perfil_id, aplicacao_id)
);

-- Enable RLS
ALTER TABLE public.aplicacao_perfis_internos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_apps_internos ENABLE ROW LEVEL SECURITY;

-- RLS for aplicacao_perfis_internos
CREATE POLICY "Authenticated can select aplicacao_perfis_internos" ON public.aplicacao_perfis_internos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select aplicacao_perfis_internos" ON public.aplicacao_perfis_internos FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert aplicacao_perfis_internos" ON public.aplicacao_perfis_internos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can update aplicacao_perfis_internos" ON public.aplicacao_perfis_internos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can delete aplicacao_perfis_internos" ON public.aplicacao_perfis_internos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- RLS for perfil_apps_internos
CREATE POLICY "Authenticated can select perfil_apps_internos" ON public.perfil_apps_internos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select perfil_apps_internos" ON public.perfil_apps_internos FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert perfil_apps_internos" ON public.perfil_apps_internos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can update perfil_apps_internos" ON public.perfil_apps_internos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can delete perfil_apps_internos" ON public.perfil_apps_internos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));