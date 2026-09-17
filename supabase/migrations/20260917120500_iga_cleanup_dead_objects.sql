-- =============================================================================
-- IGA hardening (6/7): remoção do que não faz mais sentido
--   • motor de regras (nunca executado: sem tela, sem chamador, sem efeito no Entra)
--   • colab_snapshots (zero referências)
--   • guardrails do restore de julho/2026 (iam_restore_guardrails + suppress_restore_*)
--     — só remove se a chave estiver INATIVA; se estiver ativa a migration falha de
--       propósito para que alguém avalie antes (ela suprimia inserts do ciclo diário).
--   Tabelas backup_* e iam_change_backups são mantidas (são dados).
-- =============================================================================

-- 1. Motor de regras
DROP TABLE IF EXISTS public.regra_condicoes CASCADE;
DROP TABLE IF EXISTS public.regra_resultados CASCADE;
DROP TABLE IF EXISTS public.regras CASCADE;
DROP TYPE IF EXISTS public.status_regra;

-- 2. Snapshots sem uso
DROP TABLE IF EXISTS public.colab_snapshots CASCADE;

-- 3. Guardrails de restore
DO $$
BEGIN
  IF to_regclass('public.iam_restore_guardrails') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.iam_restore_guardrails WHERE active = true) THEN
      RAISE EXCEPTION 'iam_restore_guardrails está ATIVO: os triggers suppress_restore_* estão suprimindo inserts do ciclo diário. Desative (UPDATE iam_restore_guardrails SET active=false) e reaplique.';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.suppress_restore_colaborador_delete() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_eventos_jml() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_iam_queue() CASCADE;
DROP FUNCTION IF EXISTS public.suppress_restore_perfil_atribuicoes() CASCADE;
DROP TABLE IF EXISTS public.iam_restore_guardrails CASCADE;
