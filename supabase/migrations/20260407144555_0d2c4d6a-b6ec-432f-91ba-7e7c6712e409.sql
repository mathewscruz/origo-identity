
-- Table: entra_roles (Directory Roles from Entra ID)
CREATE TABLE public.entra_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  is_privileged boolean NOT NULL DEFAULT false,
  is_built_in boolean NOT NULL DEFAULT true,
  template_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entra_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select entra_roles" ON public.entra_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select entra_roles" ON public.entra_roles FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert entra_roles" ON public.entra_roles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can update entra_roles" ON public.entra_roles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can delete entra_roles" ON public.entra_roles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Table: entra_role_members (Members of each role)
CREATE TABLE public.entra_role_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.entra_roles(id) ON DELETE CASCADE,
  user_entra_id text NOT NULL,
  user_display_name text,
  user_email text,
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, user_entra_id)
);

ALTER TABLE public.entra_role_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select entra_role_members" ON public.entra_role_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select entra_role_members" ON public.entra_role_members FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert entra_role_members" ON public.entra_role_members FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can update entra_role_members" ON public.entra_role_members FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operador'));
CREATE POLICY "Admins can delete entra_role_members" ON public.entra_role_members FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
