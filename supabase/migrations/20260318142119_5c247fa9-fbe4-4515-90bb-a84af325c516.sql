
CREATE TABLE public.cargo_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cargo_id, perfil_id)
);

ALTER TABLE public.cargo_perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select cargo_perfis" ON public.cargo_perfis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select cargo_perfis" ON public.cargo_perfis FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert cargo_perfis" ON public.cargo_perfis FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update cargo_perfis" ON public.cargo_perfis FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete cargo_perfis" ON public.cargo_perfis FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
