
-- Safety: ensure all known cron jobs are removed
DO $$
BEGIN
  PERFORM cron.unschedule('sync-csv-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-entra-queue-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Remove any other potential SharePoint-related jobs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE command ILIKE '%sync-sharepoint%' OR command ILIKE '%sync-csv%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
