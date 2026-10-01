-- Corrige a classificação atual do dashboard para os status funcionais
-- presentes na fonte RH/SharePoint de 2026-09-30.
--
-- Escopo deliberadamente fechado em 28 identidades reconciliadas por e-mail.
-- O trigger trg_iam_backup_colaboradores preserva o estado anterior em
-- public.iam_change_backups para rollback auditável.

WITH expected(email, target_status) AS (
  VALUES
    ('patty.fenelon@origoenergia.com.br', 'ferias'),
    ('eudes.amaral@origoenergia.com.br', 'ferias'),
    ('katiane.gomes@origoenergia.com.br', 'afastado'),
    ('rodrigo.souza@origoenergia.com.br', 'ferias'),
    ('marianna.vidal@origoenergia.com.br', 'afastado'),
    ('filipe.justo@origoenergia.com.br', 'afastado'),
    ('adriana.melo@origoenergia.com.br', 'afastado'),
    ('camila.campolina@origoenergia.com.br', 'afastado'),
    ('daniel.marques@origoenergia.com.br', 'ferias'),
    ('thais.braga@origoenergia.com.br', 'ferias'),
    ('kaio.mantovani@origoenergia.com.br', 'afastado'),
    ('bruno.netto@origoenergia.com.br', 'ferias'),
    ('camila.borelli@origoenergia.com.br', 'ferias'),
    ('geraldo.alves@origoenergia.com.br', 'ferias'),
    ('eduardo.nascimento@origoenergia.com.br', 'ferias'),
    ('sabrina.costa@origoenergia.com.br', 'afastado'),
    ('elusa.santos@origoenergia.com.br', 'afastado'),
    ('fernando.scamillia@origoenergia.com.br', 'ferias'),
    ('fabio.medina@origoenergia.com.br', 'ferias'),
    ('rick.lima@origoenergia.com.br', 'ferias'),
    ('marcelo.santos@origoenergia.com.br', 'ferias'),
    ('denize.aquino@origoenergia.com.br', 'ferias'),
    ('tamires.martinho@origoenergia.com.br', 'ferias'),
    ('frederico.metzker@origoenergia.com.br', 'afastado'),
    ('andre.vale@origoenergia.com.br', 'afastado'),
    ('daniel.jozala@origoenergia.com.br', 'ferias'),
    ('juliana.boff@origoenergia.com.br', 'afastado'),
    ('francesca.ferreira@origoenergia.com.br', 'afastado')
), updated AS (
  UPDATE public.colaboradores c
     SET status = e.target_status::public.status_colaborador,
         updated_at = now()
    FROM expected e
   WHERE lower(c.email) = e.email
     AND c.origem = 'csv'
     AND c.status::text IS DISTINCT FROM e.target_status
  RETURNING c.id
)
SELECT count(*) FROM updated;

DO $$
DECLARE
  v_invalid integer;
BEGIN
  WITH expected(email, target_status) AS (
    VALUES
      ('patty.fenelon@origoenergia.com.br', 'ferias'),
      ('eudes.amaral@origoenergia.com.br', 'ferias'),
      ('katiane.gomes@origoenergia.com.br', 'afastado'),
      ('rodrigo.souza@origoenergia.com.br', 'ferias'),
      ('marianna.vidal@origoenergia.com.br', 'afastado'),
      ('filipe.justo@origoenergia.com.br', 'afastado'),
      ('adriana.melo@origoenergia.com.br', 'afastado'),
      ('camila.campolina@origoenergia.com.br', 'afastado'),
      ('daniel.marques@origoenergia.com.br', 'ferias'),
      ('thais.braga@origoenergia.com.br', 'ferias'),
      ('kaio.mantovani@origoenergia.com.br', 'afastado'),
      ('bruno.netto@origoenergia.com.br', 'ferias'),
      ('camila.borelli@origoenergia.com.br', 'ferias'),
      ('geraldo.alves@origoenergia.com.br', 'ferias'),
      ('eduardo.nascimento@origoenergia.com.br', 'ferias'),
      ('sabrina.costa@origoenergia.com.br', 'afastado'),
      ('elusa.santos@origoenergia.com.br', 'afastado'),
      ('fernando.scamillia@origoenergia.com.br', 'ferias'),
      ('fabio.medina@origoenergia.com.br', 'ferias'),
      ('rick.lima@origoenergia.com.br', 'ferias'),
      ('marcelo.santos@origoenergia.com.br', 'ferias'),
      ('denize.aquino@origoenergia.com.br', 'ferias'),
      ('tamires.martinho@origoenergia.com.br', 'ferias'),
      ('frederico.metzker@origoenergia.com.br', 'afastado'),
      ('andre.vale@origoenergia.com.br', 'afastado'),
      ('daniel.jozala@origoenergia.com.br', 'ferias'),
      ('juliana.boff@origoenergia.com.br', 'afastado'),
      ('francesca.ferreira@origoenergia.com.br', 'afastado')
  )
  SELECT count(*) INTO v_invalid
    FROM expected e
    LEFT JOIN public.colaboradores c
      ON lower(c.email) = e.email AND c.origem = 'csv'
   WHERE c.id IS NULL OR c.status::text IS DISTINCT FROM e.target_status;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'Status funcional não aplicado em % identidades', v_invalid;
  END IF;
END;
$$;
