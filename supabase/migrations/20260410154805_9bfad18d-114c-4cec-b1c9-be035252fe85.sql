
-- Remove the header-based anon policies (they don't work well with JS client)
DROP POLICY IF EXISTS "Anon can select revisoes by token" ON public.revisoes;
DROP POLICY IF EXISTS "Anon can update revisoes by token" ON public.revisoes;
DROP POLICY IF EXISTS "Anon can select revisao_itens by token" ON public.revisao_itens;
DROP POLICY IF EXISTS "Anon can update revisao_itens by token" ON public.revisao_itens;

-- Create SECURITY DEFINER RPCs for token-based read access
CREATE OR REPLACE FUNCTION public.get_revisao_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(r.*) FROM revisoes r WHERE r.token = p_token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_revisao_itens_by_token(p_token text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_agg(ri.*)
  FROM revisao_itens ri
  JOIN revisoes r ON r.id = ri.revisao_id
  WHERE r.token = p_token;
$$;
