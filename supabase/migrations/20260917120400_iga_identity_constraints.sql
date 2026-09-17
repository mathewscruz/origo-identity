-- =============================================================================
-- IGA hardening (5/7): unicidade de identidade e quarentena real
--   • perfil_atribuicoes: no máximo UMA atribuição ativa por perfil × pessoa
--   • colaboradores: e-mail / SAM / matrícula únicos (criados só se a base
--     atual não tiver duplicidades — caso contrário gera alerta em vez de falhar)
--   • colab_quarentena passa a receber linhas inválidas/duplicadas do CSV
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. perfil_atribuicoes: desativa duplicatas ativas (mantém a mais antiga) e cria índice único parcial
-- ---------------------------------------------------------------------------
WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY perfil_id, colaborador_id ORDER BY data_concessao NULLS LAST, created_at) AS rn
    FROM public.perfil_atribuicoes WHERE ativo AND colaborador_id IS NOT NULL
)
UPDATE public.perfil_atribuicoes pa SET ativo = false, data_revogacao = now()
  FROM dup WHERE pa.id = dup.id AND dup.rn > 1;

WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY perfil_id, terceiro_id ORDER BY data_concessao NULLS LAST, created_at) AS rn
    FROM public.perfil_atribuicoes WHERE ativo AND terceiro_id IS NOT NULL
)
UPDATE public.perfil_atribuicoes pa SET ativo = false, data_revogacao = now()
  FROM dup WHERE pa.id = dup.id AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_perfil_atribuicoes_ativa_colab
  ON public.perfil_atribuicoes (perfil_id, colaborador_id) WHERE ativo AND colaborador_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_perfil_atribuicoes_ativa_terceiro
  ON public.perfil_atribuicoes (perfil_id, terceiro_id) WHERE ativo AND terceiro_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. colaboradores: índices únicos condicionais
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_dups int;
  v_msg  text := '';
BEGIN
  -- e-mail
  SELECT count(*) INTO v_dups FROM (SELECT lower(email) FROM public.colaboradores WHERE email IS NOT NULL AND email <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_email ON public.colaboradores (lower(email)) WHERE email IS NOT NULL AND email <> '';
  ELSE
    v_msg := v_msg || format('%s e-mail(s) duplicado(s); ', v_dups);
  END IF;
  -- SAM
  SELECT count(*) INTO v_dups FROM (SELECT lower(sam_account_name) FROM public.colaboradores WHERE sam_account_name IS NOT NULL AND sam_account_name <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_sam ON public.colaboradores (lower(sam_account_name)) WHERE sam_account_name IS NOT NULL AND sam_account_name <> '';
  ELSE
    v_msg := v_msg || format('%s SAM(s) duplicado(s); ', v_dups);
  END IF;
  -- matrícula
  SELECT count(*) INTO v_dups FROM (SELECT matricula FROM public.colaboradores WHERE matricula IS NOT NULL AND matricula <> '' GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_colaboradores_matricula ON public.colaboradores (matricula) WHERE matricula IS NOT NULL AND matricula <> '';
  ELSE
    v_msg := v_msg || format('%s matrícula(s) duplicada(s); ', v_dups);
  END IF;

  IF v_msg <> '' THEN
    RAISE NOTICE 'Índices únicos de identidade NÃO criados por duplicidade existente: %', v_msg;
    INSERT INTO public.alertas (titulo, mensagem, severidade, tipo, ref_url)
    VALUES ('Duplicidade de identidades',
            'A base tem identidades duplicadas e os índices únicos não puderam ser criados: ' || v_msg ||
            'Corrija (mescle/desligue duplicatas) e reaplique a migration 20260917120400.',
            'critico', 'identidade_duplicada', '/colaboradores');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Quarentena de importação (linhas inválidas, duplicadas, ambíguas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS dados jsonb;
ALTER TABLE public.colab_quarentena ADD COLUMN IF NOT EXISTS detalhe text;
ALTER TABLE public.colab_quarentena ALTER COLUMN colaborador_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_colab_quarentena_status ON public.colab_quarentena (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_colab_quarentena_job ON public.colab_quarentena (import_job_id);

-- colab_quarentena pode não ter RLS/políticas completas: garante leitura/escrita para admin/operador
ALTER TABLE public.colab_quarentena ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quarentena select" ON public.colab_quarentena;
DROP POLICY IF EXISTS "quarentena write" ON public.colab_quarentena;
CREATE POLICY "quarentena select" ON public.colab_quarentena FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "quarentena write" ON public.colab_quarentena FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operador'));
