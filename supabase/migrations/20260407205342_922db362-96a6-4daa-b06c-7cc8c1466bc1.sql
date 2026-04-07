
ALTER TABLE public.solicitacoes_acesso ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE POLICY "Users can insert own solicitacoes" ON public.solicitacoes_acesso FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can select own solicitacoes" ON public.solicitacoes_acesso FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role)
);
