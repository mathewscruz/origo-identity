
-- ═══════════════════════════════════════════════════════
-- 1. Alter sync_jobs: add tipo, colab counters, filename
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'entra_id',
  ADD COLUMN IF NOT EXISTS colab_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colab_updated integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colab_quarentena integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colab_inativos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colab_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colab_percent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filename text;

-- ═══════════════════════════════════════════════════════
-- 2. Alter colaboradores: add import_hash, ultima_importacao_id
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS import_hash text,
  ADD COLUMN IF NOT EXISTS ultima_importacao_id uuid;

-- ═══════════════════════════════════════════════════════
-- 3. Create colab_snapshots table
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.colab_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_job_id uuid NOT NULL REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
  matricula text NOT NULL,
  hash text NOT NULL,
  dados jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colab_snapshots_job ON public.colab_snapshots(import_job_id);
CREATE INDEX idx_colab_snapshots_matricula ON public.colab_snapshots(matricula);

ALTER TABLE public.colab_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select colab_snapshots" ON public.colab_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can select colab_snapshots" ON public.colab_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert colab_snapshots" ON public.colab_snapshots FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete colab_snapshots" ON public.colab_snapshots FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════
-- 4. Create colab_quarentena table
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.colab_quarentena (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  import_job_id uuid NOT NULL REFERENCES public.sync_jobs(id) ON DELETE CASCADE,
  motivo text NOT NULL DEFAULT 'ausente_no_csv',
  status text NOT NULL DEFAULT 'pendente',
  decidido_por text,
  decidido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_colab_quarentena_status ON public.colab_quarentena(status);
CREATE INDEX idx_colab_quarentena_colab ON public.colab_quarentena(colaborador_id);

ALTER TABLE public.colab_quarentena ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can select colab_quarentena" ON public.colab_quarentena FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can select colab_quarentena" ON public.colab_quarentena FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert colab_quarentena" ON public.colab_quarentena FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can update colab_quarentena" ON public.colab_quarentena FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
CREATE POLICY "Admins can delete colab_quarentena" ON public.colab_quarentena FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
