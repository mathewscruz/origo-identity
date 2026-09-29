-- Restore runtime dependency still referenced by IAM change-backup triggers.
-- The cleanup migration removed this helper while live trigger functions still call it.

CREATE OR REPLACE FUNCTION public.iam_backup_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
BEGIN
  BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    claims := '{}'::jsonb;
  END;
  RETURN coalesce(claims->>'email', claims->>'sub', current_user);
END;
$function$;

REVOKE ALL ON FUNCTION public.iam_backup_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iam_backup_actor() TO authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';
