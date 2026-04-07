UPDATE iam_queue SET status = 'cancelled' WHERE status IN ('pending', 'processing');

SELECT cron.unschedule('sync-csv-diario');
SELECT cron.unschedule('process-entra-queue-every-5min');