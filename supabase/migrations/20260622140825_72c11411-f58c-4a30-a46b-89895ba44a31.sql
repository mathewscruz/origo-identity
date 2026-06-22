
-- 1. Extend entra_role_members for PIM
ALTER TABLE public.entra_role_members
  ADD COLUMN IF NOT EXISTS assignment_type text NOT NULL DEFAULT 'permanente',
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS directory_scope_id text;

-- 2. Known admin/breakglass accounts
CREATE TABLE IF NOT EXISTS public.contas_admin_conhecidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id text NOT NULL UNIQUE,
  display_name text,
  email text,
  motivo text NOT NULL,
  dono_responsavel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_admin_conhecidas TO authenticated;
GRANT ALL ON public.contas_admin_conhecidas TO service_role;

ALTER TABLE public.contas_admin_conhecidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read contas_admin"
  ON public.contas_admin_conhecidas FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin/operador insert contas_admin"
  ON public.contas_admin_conhecidas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "admin/operador update contas_admin"
  ON public.contas_admin_conhecidas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "admin delete contas_admin"
  ON public.contas_admin_conhecidas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_contas_admin_updated
  BEFORE UPDATE ON public.contas_admin_conhecidas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Default parameters
INSERT INTO public.parametros (chave, valor, descricao)
VALUES
  ('priv_role_max_membros', '3', 'Quantidade máxima recomendada de membros em uma role privilegiada antes de gerar alerta crítico'),
  ('entra_roles_last_sync', '', 'Timestamp ISO da última sincronização do módulo de Acessos Privilegiados')
ON CONFLICT (chave) DO NOTHING;
