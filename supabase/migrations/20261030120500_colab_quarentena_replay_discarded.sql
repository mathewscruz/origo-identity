-- Reaplica a decisão anterior apenas a uma pendência de RH rigorosamente idêntica.
-- Nunca altera colaboradores/acessos; fatos novos e falhas reais continuam pendentes.
CREATE INDEX IF NOT EXISTS colab_quarentena_replay_lookup_idx
  ON public.colab_quarentena (motivo, matricula, created_at DESC, id DESC)
  WHERE motivo IN ('ausente_no_csv', 'duplicado_no_csv', 'matricula_ambigua');

CREATE OR REPLACE FUNCTION public.colab_quarentena_replay_discarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_status text;
  previous_actor text;
  previous_decided_at timestamptz;
BEGIN
  IF NEW.status <> 'pendente'
     OR NEW.motivo NOT IN ('ausente_no_csv', 'duplicado_no_csv', 'matricula_ambigua') THEN
    RETURN NEW;
  END IF;

  -- A decisão mais recente para a mesma identidade e os mesmos dados é soberana:
  -- uma resolução posterior, uma pendência nova ou uma mudança de dados bloqueia o replay.
  SELECT q.status, q.decidido_por, q.decidido_em
    INTO previous_status, previous_actor, previous_decided_at
  FROM public.colab_quarentena q
  WHERE q.created_at < NEW.created_at
    AND q.motivo = NEW.motivo
    AND q.matricula IS NOT DISTINCT FROM NEW.matricula
    AND q.colaborador_id IS NOT DISTINCT FROM NEW.colaborador_id
    AND q.nome IS NOT DISTINCT FROM NEW.nome
    AND q.email IS NOT DISTINCT FROM NEW.email
    AND q.dados IS NOT DISTINCT FROM NEW.dados
  ORDER BY q.created_at DESC, q.id DESC
  LIMIT 1;

  IF previous_status = 'descartado'
     AND previous_actor IS NOT NULL
     AND previous_decided_at IS NOT NULL THEN
    NEW.status := 'descartado';
    NEW.decidido_por := 'hermes:replay_decisao_rh';
    NEW.decidido_em := now();
    NEW.detalhe := concat_ws(' · ', NULLIF(NEW.detalhe, ''),
      'Repetição idêntica: descarte anterior reaplicado; nova evidência volta à triagem');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.colab_quarentena_replay_discarded() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_colab_quarentena_replay_discarded ON public.colab_quarentena;
CREATE TRIGGER trg_colab_quarentena_replay_discarded
  BEFORE INSERT ON public.colab_quarentena
  FOR EACH ROW EXECUTE FUNCTION public.colab_quarentena_replay_discarded();

-- Limpeza cirúrgica do lote de 30/10: somente reincidências cuja decisão
-- anterior, para identidade e linha idênticas, foi efetivamente descartada.
WITH matches AS (
  SELECT q.id,
    (SELECT CASE WHEN p.status = 'descartado'
                   AND p.decidido_por IS NOT NULL AND p.decidido_em IS NOT NULL
                 THEN true ELSE false END
       FROM public.colab_quarentena p
      WHERE p.created_at < q.created_at
        AND p.motivo = q.motivo
        AND p.matricula IS NOT DISTINCT FROM q.matricula
        AND p.colaborador_id IS NOT DISTINCT FROM q.colaborador_id
        AND p.nome IS NOT DISTINCT FROM q.nome
        AND p.email IS NOT DISTINCT FROM q.email
        AND p.dados IS NOT DISTINCT FROM q.dados
      ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS prior_discarded
  FROM public.colab_quarentena q
  WHERE q.import_job_id = 'fd86e17b-d8a0-4fa4-b54c-472f3679b2a9'::uuid
    AND q.status = 'pendente'
    AND q.motivo IN ('ausente_no_csv', 'duplicado_no_csv', 'matricula_ambigua')
)
UPDATE public.colab_quarentena q
SET status = 'descartado',
    decidido_por = 'hermes:replay_decisao_rh',
    decidido_em = now(),
    detalhe = concat_ws(' · ', NULLIF(q.detalhe, ''),
      'Repetição idêntica: descarte anterior reaplicado; nova evidência volta à triagem')
FROM matches m
WHERE q.id = m.id AND m.prior_discarded IS TRUE;

-- Testes transacionais: inserções nunca persistem. Replay idêntico desaparece
-- dos pendentes, mas um nome alterado permanece para revisão humana.
DO $$
DECLARE
  sample public.colab_quarentena%ROWTYPE;
  got text;
BEGIN
  SELECT * INTO STRICT sample FROM public.colab_quarentena
  WHERE import_job_id = 'fd86e17b-d8a0-4fa4-b54c-472f3679b2a9'::uuid
    AND motivo = 'duplicado_no_csv' AND status = 'descartado'
  ORDER BY created_at DESC LIMIT 1;
  BEGIN
    INSERT INTO public.colab_quarentena
      (import_job_id, motivo, status, colaborador_id, matricula, nome, email, dados, detalhe)
    VALUES (sample.import_job_id, sample.motivo, 'pendente', sample.colaborador_id,
      sample.matricula, sample.nome, sample.email, sample.dados, sample.detalhe)
    RETURNING status INTO got;
    IF got <> 'descartado' THEN RAISE EXCEPTION 'replay_not_discarded'; END IF;
    RAISE EXCEPTION 'rollback_test';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_test' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.colab_quarentena
      (import_job_id, motivo, status, colaborador_id, matricula, nome, email, dados, detalhe)
    VALUES (sample.import_job_id, sample.motivo, 'pendente', sample.colaborador_id,
      sample.matricula, sample.nome || ' (nova evidência)', sample.email, sample.dados, sample.detalhe)
    RETURNING status INTO got;
    IF got <> 'pendente' THEN RAISE EXCEPTION 'changed_data_hidden'; END IF;
    RAISE EXCEPTION 'rollback_test';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_test' THEN RAISE; END IF;
  END;
END;
$$;