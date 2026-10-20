DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.revisao_criar'::regproc);
  d := replace(d, 'v_owner := v_app.owner;',
    'v_owner := COALESCE((SELECT nome FROM public.colaboradores WHERE id = COALESCE(v_app.revisor_colaborador_id, v_app.owner_colaborador_id)), v_app.owner);');
  d := replace(d, 'v_email := public.iam_resolve_email(v_app.owner);',
    'v_email := COALESCE(public.aplicacao_responsavel_revisao(v_app.id), public.iam_resolve_email(v_app.owner));');
  EXECUTE d;
END $do$;