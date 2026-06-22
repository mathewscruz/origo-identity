
-- Reduzir superfície de funções SECURITY DEFINER (linter 0028/0029)
-- has_role / has_any_app_role: usadas apenas server-side / por usuários autenticados em RLS.
-- Revogar EXECUTE de anon e do PUBLIC; manter authenticated e service_role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_app_role(uuid) TO authenticated, service_role;

-- get_revisao_by_token / get_revisao_itens_by_token: portal externo de revisão usa token público (anon).
-- Revogar de authenticated/PUBLIC e manter apenas anon + service_role (acesso controlado pelo token).
REVOKE EXECUTE ON FUNCTION public.get_revisao_by_token(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revisao_itens_by_token(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_revisao_by_token(text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_revisao_itens_by_token(text) TO anon, service_role;
