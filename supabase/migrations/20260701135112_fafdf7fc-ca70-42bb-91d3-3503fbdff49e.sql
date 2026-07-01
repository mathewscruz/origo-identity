UPDATE public.eventos_jml e
SET colaborador_id = c.id
FROM public.colaboradores c
WHERE e.colaborador_id IS NULL
  AND e.tipo = 'joiner'
  AND (e.dados_depois->>'matricula') IS NOT NULL
  AND c.matricula = (e.dados_depois->>'matricula');

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(colaborador_id::text, colaborador_nome)
           ORDER BY created_at DESC
         ) AS rn
  FROM public.eventos_jml
  WHERE tipo = 'joiner' AND status = 'pendente'
)
UPDATE public.eventos_jml e
SET status = 'executado',
    erro_mensagem = 'Deduplicado durante reconciliação'
FROM ranked r
WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_jml_pendente_unico
  ON public.eventos_jml (colaborador_id, tipo)
  WHERE status = 'pendente' AND colaborador_id IS NOT NULL;