
-- Create solicitacao_itens table for per-item approval tracking
CREATE TABLE public.solicitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_acesso(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  recurso_id uuid NOT NULL,
  recurso_nome text,
  owner_email text,
  status text NOT NULL DEFAULT 'pendente',
  decidido_por text,
  decidido_em timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.solicitacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select solicitacao_itens"
ON public.solicitacao_itens FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert solicitacao_itens"
ON public.solicitacao_itens FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

CREATE POLICY "Admins can update solicitacao_itens"
ON public.solicitacao_itens FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

CREATE POLICY "Admins can delete solicitacao_itens"
ON public.solicitacao_itens FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow portal users to insert their own items
CREATE POLICY "Users can insert own solicitacao_itens"
ON public.solicitacao_itens FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.solicitacoes_acesso sa
    WHERE sa.id = solicitacao_id AND sa.user_id = auth.uid()
  )
);

-- Add owner column to entra_grupos
ALTER TABLE public.entra_grupos ADD COLUMN IF NOT EXISTS owner text;

-- Add owner column to licencas
ALTER TABLE public.licencas ADD COLUMN IF NOT EXISTS owner text;
