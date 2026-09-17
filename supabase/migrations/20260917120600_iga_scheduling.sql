-- =============================================================================
-- IGA hardening (7/7): agenda (pg_cron + pg_net + Vault)
--
-- Nada rodava sozinho: ciclo diário do RH, expiração de exceções/terceiros e
-- recertificação dependiam de alguém clicar. Os jobs abaixo chamam as edge
-- functions com a service role key guardada no Vault (nunca em migrations).
--
-- Passo manual ÚNICO (SQL editor do Lovable Cloud, uma vez):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'origo_functions_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'origo_service_role_key');
-- Sem os segredos, os jobs apenas registram NOTICE e não fazem nada.
-- =============================================================================

-- (CREATE EXTENSION IF NOT EXISTS dispara o event trigger do Supabase mesmo com a
--  extensão já instalada e falha com "dependent privileges exist"; por isso o guard)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net WITH SCHEMA extensions;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iam_cron_invoke(p_function text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
  v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'origo_functions_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'origo_service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'iam_cron_invoke(%): segredos origo_functions_url/origo_service_role_key ausentes no Vault — job ignorado', p_function;
    RETURN NULL;
  END IF;
  IF public.iam_param('modo_operacao', 'producao') = 'simulacao' AND p_function IN ('process-iam-queue') THEN
    RETURN NULL;
  END IF;
  SELECT net.http_post(
           url     := rtrim(v_url, '/') || '/' || p_function,
           headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'apikey', v_key),
           body    := COALESCE(p_body, '{}'::jsonb),
           timeout_milliseconds := 120000)
    INTO v_req;
  INSERT INTO public.auditoria (acao, entidade, operador, resumo, detalhes)
  VALUES ('cron_invoke', 'scheduler', 'pg_cron', 'Job agendado disparou ' || p_function, jsonb_build_object('request_id', v_req, 'body', p_body));
  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION public.iam_cron_invoke(text, jsonb) FROM PUBLIC, anon, authenticated;

-- (re)agenda de forma idempotente
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobid, jobname FROM cron.job WHERE jobname LIKE 'origo-%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  -- 05:00 UTC — expira exceções de acesso vencidas
  PERFORM cron.schedule('origo-expire-exceptions', '0 5 * * *',
    $cmd$ SELECT public.iam_cron_invoke('expire-access-exceptions', '{}'::jsonb) $cmd$);
  -- 05:15 UTC — recertificação automática + expiração/revalidação de terceiros
  PERFORM cron.schedule('origo-auto-recertification', '15 5 * * *',
    $cmd$ SELECT public.iam_cron_invoke('auto-recertification', '{}'::jsonb) $cmd$);
  -- 06:30 UTC — ciclo diário do RH (SharePoint → reconcile → fila)
  PERFORM cron.schedule('origo-daily-cycle', '30 6 * * *',
    $cmd$ SELECT public.iam_cron_invoke('run-daily-cycle', '{}'::jsonb) $cmd$);
  -- a cada 15 min — processa a fila (no modo agent_orchestrated retorna 202 e sai)
  PERFORM cron.schedule('origo-process-queue', '*/15 * * * *',
    $cmd$ SELECT public.iam_cron_invoke('process-iam-queue', '{}'::jsonb) $cmd$);
  -- semanal, domingo 04:00 UTC — auditoria por amostragem da reconciliação
  PERFORM cron.schedule('origo-audit-reconciliation', '0 4 * * 0',
    $cmd$ SELECT public.iam_cron_invoke('audit-reconciliation', '{}'::jsonb) $cmd$);
END $$;
