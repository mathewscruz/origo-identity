-- =============================================================================
-- roles.sql — executado pelo Supabase CLI ANTES das migrations (como superuser)
-- em `supabase start` e `supabase db reset`. Somente ambiente local.
-- =============================================================================
-- Imagens recentes do Postgres local vêm com "secure defaults": tabelas novas em
-- `public` NÃO recebem SELECT/INSERT/UPDATE/DELETE para anon/authenticated.
-- O projeto em produção (Lovable Cloud, criado em 2026-03) usa os defaults
-- clássicos do Supabase, e a maioria das tabelas depende deles (não há GRANT
-- explícito nas migrations). Aqui restauramos os defaults clássicos para que o
-- histórico de migrations produza o mesmo resultado de produção — inclusive os
-- REVOKEs de hardening feitos depois, que continuam valendo por cima.
-- =============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
