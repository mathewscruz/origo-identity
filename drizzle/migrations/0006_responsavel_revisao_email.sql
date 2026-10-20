CREATE OR REPLACE FUNCTION public.aplicacao_responsavel_revisao(p_aplicacao_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(r.email, o.email)
    FROM aplicacoes a LEFT JOIN colaboradores r ON r.id = a.revisor_colaborador_id LEFT JOIN colaboradores o ON o.id = a.owner_colaborador_id
   WHERE a.id = p_aplicacao_id
$$;