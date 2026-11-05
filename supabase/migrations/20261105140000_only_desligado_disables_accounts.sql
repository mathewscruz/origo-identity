-- Status funcional não é bloqueio de conta; só desligado desativa.
-- Preserva o restante da função publicada (inclusive controles JML existentes).
DO $migration$
DECLARE
  v_old text;
  v_new text;
  v_from text := 'v_hard  := v_new IN (''inativo'',''desligado'') AND v_old NOT IN (''inativo'',''desligado'');';
  v_to text := 'v_hard  := v_new = ''desligado'' AND v_old <> ''desligado'';';
  v_soft_from text := 'v_soft  := v_old = ''ativo'' AND v_new IN (''ferias'',''afastado'');';
  v_soft_to text := 'v_soft  := false;';

BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_old
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='jml_alterar_status'
     AND pg_get_function_identity_arguments(p.oid) = 'p_colaborador_id uuid, p_novo_status text, p_operador text, p_origem text, p_motivo text, p_skip_status_update boolean';
  IF v_old IS NULL
     OR (position(v_from IN v_old)=0 AND position(v_to IN v_old)=0)
     OR (position(v_soft_from IN v_old)=0 AND position(v_soft_to IN v_old)=0) THEN
    RAISE EXCEPTION 'jml_alterar_status signature/body mismatch; refusing unsafe replacement';
  END IF;
  v_new := replace(replace(v_old,v_from,v_to),v_soft_from,v_soft_to);
  IF v_new <> v_old THEN EXECUTE v_new; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='jml_alterar_status'
       AND position(v_to IN pg_get_functiondef(p.oid)) > 0
       AND position(v_soft_to IN pg_get_functiondef(p.oid)) > 0
  ) THEN RAISE EXCEPTION 'read-back failed'; END IF;
END $migration$;
