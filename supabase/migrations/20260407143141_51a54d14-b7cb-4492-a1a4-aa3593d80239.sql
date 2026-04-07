
-- Self-Service: solicitações de acesso
CREATE TABLE public.solicitacoes_acesso (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitante_id UUID NOT NULL,
  perfil_id UUID NOT NULL,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  aprovador TEXT,
  comentario TEXT,
  data_decisao TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT solicitacoes_acesso_solicitante_fkey FOREIGN KEY (solicitante_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  CONSTRAINT solicitacoes_acesso_perfil_fkey FOREIGN KEY (perfil_id) REFERENCES public.perfis_acesso(id) ON DELETE CASCADE
);

ALTER TABLE public.solicitacoes_acesso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select solicitacoes_acesso" ON public.solicitacoes_acesso FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select solicitacoes_acesso" ON public.solicitacoes_acesso FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert solicitacoes_acesso" ON public.solicitacoes_acesso FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update solicitacoes_acesso" ON public.solicitacoes_acesso FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete solicitacoes_acesso" ON public.solicitacoes_acesso FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Workflow: etapas configuráveis
CREATE TABLE public.workflow_etapas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade_tipo TEXT NOT NULL DEFAULT 'solicitacao',
  ordem INTEGER NOT NULL DEFAULT 1,
  aprovador_tipo TEXT NOT NULL DEFAULT 'gestor',
  timeout_horas INTEGER NOT NULL DEFAULT 48,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select workflow_etapas" ON public.workflow_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select workflow_etapas" ON public.workflow_etapas FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert workflow_etapas" ON public.workflow_etapas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update workflow_etapas" ON public.workflow_etapas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete workflow_etapas" ON public.workflow_etapas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Workflow: execuções (tracking de cada etapa)
CREATE TABLE public.workflow_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade_tipo TEXT NOT NULL DEFAULT 'solicitacao',
  entidade_id UUID NOT NULL,
  etapa_id UUID NOT NULL,
  aprovador TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_decisao TIMESTAMP WITH TIME ZONE,
  comentario TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT workflow_execucoes_etapa_fkey FOREIGN KEY (etapa_id) REFERENCES public.workflow_etapas(id) ON DELETE CASCADE
);

ALTER TABLE public.workflow_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can select workflow_execucoes" ON public.workflow_execucoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can select workflow_execucoes" ON public.workflow_execucoes FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can insert workflow_execucoes" ON public.workflow_execucoes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update workflow_execucoes" ON public.workflow_execucoes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete workflow_execucoes" ON public.workflow_execucoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
