-- Clean up duplicate active perfil_atribuicoes: keep only the newest per (colaborador_id, perfil_id, origem)
DELETE FROM perfil_atribuicoes
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY colaborador_id, perfil_id, origem
      ORDER BY created_at DESC
    ) as rn
    FROM perfil_atribuicoes
    WHERE ativo = true
  ) ranked
  WHERE rn > 1
);