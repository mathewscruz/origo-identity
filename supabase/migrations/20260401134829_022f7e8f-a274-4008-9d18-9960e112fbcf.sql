
CREATE TABLE public.iam_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload_json jsonb NOT NULL,
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result_message text,
  correlation_id text NOT NULL DEFAULT gen_random_uuid()::text,
  colaborador_id uuid
);

ALTER TABLE public.iam_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select iam_queue" ON public.iam_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert iam_queue" ON public.iam_queue FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update iam_queue" ON public.iam_queue FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete iam_queue" ON public.iam_queue FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anon can select iam_queue" ON public.iam_queue FOR SELECT TO anon USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.iam_queue;
