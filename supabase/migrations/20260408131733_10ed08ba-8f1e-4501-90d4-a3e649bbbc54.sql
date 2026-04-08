
-- #11: Remove anon SELECT from all sensitive tables
-- Keep anon SELECT only on revisao_itens (external review) and revisoes (external review needs it)

DROP POLICY IF EXISTS "Anon can select alertas" ON public.alertas;
DROP POLICY IF EXISTS "Anon can select aplicacao_perfis_internos" ON public.aplicacao_perfis_internos;
DROP POLICY IF EXISTS "Anon can select aplicacoes" ON public.aplicacoes;
DROP POLICY IF EXISTS "Anon can select areas" ON public.areas;
DROP POLICY IF EXISTS "Anon can select auditoria" ON public.auditoria;
DROP POLICY IF EXISTS "Anon can select cargo_perfis" ON public.cargo_perfis;
DROP POLICY IF EXISTS "Anon can select cargos" ON public.cargos;
DROP POLICY IF EXISTS "Anon can select colab_quarentena" ON public.colab_quarentena;
DROP POLICY IF EXISTS "Anon can select colab_snapshots" ON public.colab_snapshots;
DROP POLICY IF EXISTS "Anon can select colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "Anon can select empresas" ON public.empresas;
DROP POLICY IF EXISTS "Anon can select entra_grupos" ON public.entra_grupos;
DROP POLICY IF EXISTS "Anon can select entra_licencas" ON public.entra_licencas;
DROP POLICY IF EXISTS "Anon can select entra_role_members" ON public.entra_role_members;
DROP POLICY IF EXISTS "Anon can select entra_roles" ON public.entra_roles;
DROP POLICY IF EXISTS "Anon can select evento_jml_acoes" ON public.evento_jml_acoes;
DROP POLICY IF EXISTS "Anon can select evento_jml_aprovacoes" ON public.evento_jml_aprovacoes;
DROP POLICY IF EXISTS "Anon can select eventos_jml" ON public.eventos_jml;
DROP POLICY IF EXISTS "Anon can select excecoes" ON public.excecoes;
DROP POLICY IF EXISTS "Anon can select iam_queue" ON public.iam_queue;
DROP POLICY IF EXISTS "Anon can select licencas" ON public.licencas;
DROP POLICY IF EXISTS "Anon can select localidades" ON public.localidades;
DROP POLICY IF EXISTS "Anon can select operadores" ON public.operadores;
DROP POLICY IF EXISTS "Anon can select parametros" ON public.parametros;
DROP POLICY IF EXISTS "Anon can select perfil_aplicacoes" ON public.perfil_aplicacoes;
DROP POLICY IF EXISTS "Anon can select perfil_apps_internos" ON public.perfil_apps_internos;
DROP POLICY IF EXISTS "Anon can select perfil_atribuicoes" ON public.perfil_atribuicoes;
DROP POLICY IF EXISTS "Anon can select perfil_composicao" ON public.perfil_composicao;
DROP POLICY IF EXISTS "Anon can select perfil_grupos" ON public.perfil_grupos;
DROP POLICY IF EXISTS "Anon can select perfil_licencas" ON public.perfil_licencas;
DROP POLICY IF EXISTS "Anon can select perfis_acesso" ON public.perfis_acesso;
DROP POLICY IF EXISTS "Anon can select sod_conflitos" ON public.sod_conflitos;
DROP POLICY IF EXISTS "Anon can select solicitacoes_acesso" ON public.solicitacoes_acesso;
DROP POLICY IF EXISTS "Anon can select sync_jobs" ON public.sync_jobs;
DROP POLICY IF EXISTS "Anon can select terceiros" ON public.terceiros;
DROP POLICY IF EXISTS "Anon can select workflow_etapas" ON public.workflow_etapas;
DROP POLICY IF EXISTS "Anon can select workflow_execucoes" ON public.workflow_execucoes;
DROP POLICY IF EXISTS "Anon can select user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anon can select profiles" ON public.profiles;

-- Also remove dangerous anon INSERT/UPDATE policies
DROP POLICY IF EXISTS "Anon can insert auditoria anon" ON public.auditoria;
DROP POLICY IF EXISTS "Anon can insert iam_queue anon" ON public.iam_queue;
DROP POLICY IF EXISTS "Anon can update perfil_atribuicoes anon" ON public.perfil_atribuicoes;

-- #3: Drop operadores table (no longer used)
DROP TABLE IF EXISTS public.operadores;

-- #10: Drop perfil_composicao table (no longer used in UI)
DROP TABLE IF EXISTS public.perfil_composicao;
