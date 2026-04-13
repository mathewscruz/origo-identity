
-- 1. sharepoint_sites
CREATE TABLE public.sharepoint_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sharepoint_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select sharepoint_sites" ON public.sharepoint_sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sharepoint_sites" ON public.sharepoint_sites FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update sharepoint_sites" ON public.sharepoint_sites FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete sharepoint_sites" ON public.sharepoint_sites FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. sharepoint_pastas
CREATE TABLE public.sharepoint_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_db_id uuid NOT NULL REFERENCES public.sharepoint_sites(id) ON DELETE CASCADE,
  drive_item_id text,
  nome text NOT NULL,
  caminho text,
  parent_id uuid REFERENCES public.sharepoint_pastas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sharepoint_pastas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select sharepoint_pastas" ON public.sharepoint_pastas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sharepoint_pastas" ON public.sharepoint_pastas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update sharepoint_pastas" ON public.sharepoint_pastas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete sharepoint_pastas" ON public.sharepoint_pastas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. perfil_sharepoint
CREATE TABLE public.perfil_sharepoint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sharepoint_sites(id) ON DELETE CASCADE,
  pasta_nivel1_id uuid REFERENCES public.sharepoint_pastas(id) ON DELETE SET NULL,
  pasta_nivel2_id uuid REFERENCES public.sharepoint_pastas(id) ON DELETE SET NULL,
  permissao text NOT NULL DEFAULT 'leitura',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perfil_sharepoint ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select perfil_sharepoint" ON public.perfil_sharepoint FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert perfil_sharepoint" ON public.perfil_sharepoint FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update perfil_sharepoint" ON public.perfil_sharepoint FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete perfil_sharepoint" ON public.perfil_sharepoint FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
