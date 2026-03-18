
-- entra_licencas cache table
CREATE TABLE public.entra_licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  em_uso integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entra_licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select entra_licencas" ON public.entra_licencas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select entra_licencas" ON public.entra_licencas FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert entra_licencas" ON public.entra_licencas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update entra_licencas" ON public.entra_licencas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete entra_licencas" ON public.entra_licencas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- entra_grupos cache table
CREATE TABLE public.entra_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entra_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select entra_grupos" ON public.entra_grupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select entra_grupos" ON public.entra_grupos FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert entra_grupos" ON public.entra_grupos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update entra_grupos" ON public.entra_grupos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete entra_grupos" ON public.entra_grupos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- perfil_licencas join table
CREATE TABLE public.perfil_licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  licenca_id uuid NOT NULL REFERENCES public.entra_licencas(id) ON DELETE CASCADE,
  UNIQUE(perfil_id, licenca_id)
);
ALTER TABLE public.perfil_licencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select perfil_licencas" ON public.perfil_licencas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select perfil_licencas" ON public.perfil_licencas FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert perfil_licencas" ON public.perfil_licencas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update perfil_licencas" ON public.perfil_licencas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete perfil_licencas" ON public.perfil_licencas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- perfil_grupos join table
CREATE TABLE public.perfil_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES public.entra_grupos(id) ON DELETE CASCADE,
  UNIQUE(perfil_id, grupo_id)
);
ALTER TABLE public.perfil_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select perfil_grupos" ON public.perfil_grupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select perfil_grupos" ON public.perfil_grupos FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert perfil_grupos" ON public.perfil_grupos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update perfil_grupos" ON public.perfil_grupos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete perfil_grupos" ON public.perfil_grupos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
