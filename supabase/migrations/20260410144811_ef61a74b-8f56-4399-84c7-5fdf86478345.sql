-- Remove dangerous anon INSERT on iam_queue
DROP POLICY IF EXISTS "Anon can insert iam_queue" ON public.iam_queue;

-- Remove dangerous anon INSERT on auditoria
DROP POLICY IF EXISTS "Anon can insert auditoria" ON public.auditoria;

-- Remove dangerous anon UPDATE on perfil_atribuicoes
DROP POLICY IF EXISTS "Anon can update perfil_atribuicoes" ON public.perfil_atribuicoes;

-- Remove anon SELECT on legacy regras tables (module removed from codebase)
DROP POLICY IF EXISTS "Anon can select regras" ON public.regras;
DROP POLICY IF EXISTS "Anon can select regra_condicoes" ON public.regra_condicoes;
DROP POLICY IF EXISTS "Anon can select regra_resultados" ON public.regra_resultados;