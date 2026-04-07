
-- Drop existing conflicting policies first
DROP POLICY IF EXISTS "Anon can update revisao_itens" ON public.revisao_itens;
DROP POLICY IF EXISTS "Anon can update revisoes" ON public.revisoes;
DROP POLICY IF EXISTS "Anon can insert auditoria anon" ON public.auditoria;
DROP POLICY IF EXISTS "Anon can insert iam_queue anon" ON public.iam_queue;
DROP POLICY IF EXISTS "Anon can update perfil_atribuicoes anon" ON public.perfil_atribuicoes;

-- Re-create
CREATE POLICY "Anon can update revisao_itens" ON public.revisao_itens FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can update revisoes" ON public.revisoes FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can insert auditoria anon" ON public.auditoria FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can insert iam_queue anon" ON public.iam_queue FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update perfil_atribuicoes anon" ON public.perfil_atribuicoes FOR UPDATE TO anon USING (true);
