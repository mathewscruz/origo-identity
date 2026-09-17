UPDATE iam_queue SET status = 'cancelled' WHERE status IN ('pending', 'processing');

-- Os jobs abaixo foram criados manualmente em produção (fora das migrations),
-- portanto podem não existir em ambientes novos (ex.: supabase start local).
-- Tornado idempotente para permitir aplicar o histórico do zero.
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
