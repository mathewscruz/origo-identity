-- (tolerante a falta de privilégio em realtime.messages no ambiente local)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated can subscribe to non-sensitive realtime topics" ON realtime.messages;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'realtime.messages: sem privilégio neste ambiente, política ignorada';
END $$;
