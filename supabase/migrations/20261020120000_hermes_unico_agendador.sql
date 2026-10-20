-- Hermes Agent é o único agendador/executor: remove toda a agenda pg_cron e o disparador interno.
DO $$
DECLARE j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('origo-expire-exceptions','origo-auto-recertification',
      'origo-daily-cycle','origo-audit-reconciliation','sync-sharepoint-csv-daily','origo-process-queue') LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.iam_cron_invoke(text, jsonb);
