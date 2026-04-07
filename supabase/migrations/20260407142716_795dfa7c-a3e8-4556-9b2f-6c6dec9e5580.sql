
CREATE TABLE public.sod_conflitos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_a_id UUID NOT NULL,
  perfil_b_id UUID NOT NULL,
  descricao TEXT,
  severidade TEXT NOT NULL DEFAULT 'alto',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT sod_conflitos_perfil_a_fkey FOREIGN KEY (perfil_a_id) REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  CONSTRAINT sod_conflitos_perfil_b_fkey FOREIGN KEY (perfil_b_id) REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  CONSTRAINT sod_conflitos_unique UNIQUE (perfil_a_id, perfil_b_id)
);

ALTER TABLE public.sod_conflitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select sod_conflitos" ON public.sod_conflitos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select sod_conflitos" ON public.sod_conflitos FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert sod_conflitos" ON public.sod_conflitos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update sod_conflitos" ON public.sod_conflitos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete sod_conflitos" ON public.sod_conflitos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
