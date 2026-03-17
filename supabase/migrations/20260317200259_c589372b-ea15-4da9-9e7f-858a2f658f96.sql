
CREATE TABLE public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  phase text,
  message text,
  users_total int DEFAULT 0,
  users_created int DEFAULT 0,
  users_updated int DEFAULT 0,
  users_percent int DEFAULT 0,
  apps_total int DEFAULT 0,
  apps_created int DEFAULT 0,
  apps_updated int DEFAULT 0,
  apps_percent int DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select sync_jobs" ON public.sync_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can select sync_jobs" ON public.sync_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sync_jobs" ON public.sync_jobs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update sync_jobs" ON public.sync_jobs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete sync_jobs" ON public.sync_jobs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
