
-- A. Enrich entra_licencas
ALTER TABLE public.entra_licencas
  ADD COLUMN IF NOT EXISTS friendly_name text,
  ADD COLUMN IF NOT EXISTS capability_status text,
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false;

-- B. View for external license real usage (counts successful assignments in iam_queue)
CREATE OR REPLACE VIEW public.licencas_externas_uso
WITH (security_invoker=on) AS
SELECT
  l.id AS licenca_id,
  COUNT(DISTINCT q.colaborador_id)::int AS em_uso_calc
FROM public.licencas l
LEFT JOIN public.iam_queue q
  ON q.action_type = 'assign_license'
 AND q.status = 'success'
 AND (q.payload_json->>'licencaIdExterna' = l.id::text
      OR q.payload_json->>'skuId' = l.id::text)
GROUP BY l.id;

GRANT SELECT ON public.licencas_externas_uso TO authenticated;
GRANT ALL ON public.licencas_externas_uso TO service_role;

-- C. Default critical threshold parameter (idempotent)
INSERT INTO public.parametros (chave, valor, descricao)
VALUES ('licenca_critico_pct', '90', 'Percentual mínimo de uso para considerar uma licença crítica')
ON CONFLICT (chave) DO NOTHING;
