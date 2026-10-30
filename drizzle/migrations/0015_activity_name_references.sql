CREATE OR REPLACE FUNCTION public.activity_name_references(p_names text[])
RETURNS TABLE(corrupted_name text, reference_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT c.nome, b.reference_name
  FROM public.colaboradores c
  JOIN LATERAL (
    SELECT old_data->>'nome' AS reference_name
    FROM public.iam_change_backups
    WHERE table_name = 'colaboradores' AND record_id = c.id::text
      AND old_data->>'nome' IS NOT NULL
      AND old_data->>'nome' NOT LIKE '%' || chr(65533) || '%'
      AND old_data->>'cpf' IS NOT DISTINCT FROM c.cpf
      AND old_data->>'matricula' IS NOT DISTINCT FROM c.matricula
    ORDER BY created_at DESC LIMIT 1
  ) b ON true
  WHERE c.nome = ANY(p_names[1:200])
    AND c.nome LIKE '%' || chr(65533) || '%'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operador'::public.app_role)
      OR public.has_role(auth.uid(), 'viewer'::public.app_role));
$$;
REVOKE ALL ON FUNCTION public.activity_name_references(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_name_references(text[]) TO authenticated;
COMMENT ON FUNCTION public.activity_name_references(text[]) IS 'Read-only name references from identity-matched backups for corrupted activity text; never modifies identities or audit history.';