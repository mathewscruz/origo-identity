DROP VIEW IF EXISTS public.licencas_catalogo;

CREATE OR REPLACE FUNCTION public.licencas_catalogo()
RETURNS TABLE (id uuid, nome text, aplicacao_id uuid, owner text, tipo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.nome, l.aplicacao_id, l.owner, l.tipo::text
  FROM public.licencas l
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.licencas_catalogo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.licencas_catalogo() FROM anon;
GRANT EXECUTE ON FUNCTION public.licencas_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.licencas_catalogo() TO service_role;