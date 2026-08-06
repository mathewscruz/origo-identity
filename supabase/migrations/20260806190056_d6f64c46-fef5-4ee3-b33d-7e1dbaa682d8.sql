-- 1) Restrict inserts on iam_change_backups (triggers are SECURITY DEFINER and bypass RLS)
DROP POLICY IF EXISTS "System can insert iam change backups" ON public.iam_change_backups;
CREATE POLICY "Service role can insert iam change backups"
  ON public.iam_change_backups
  FOR INSERT
  TO service_role
  WITH CHECK (true);

REVOKE INSERT ON public.iam_change_backups FROM anon, authenticated;

-- 2) Fix mutable search_path
CREATE OR REPLACE FUNCTION public.iam_backup_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  claims jsonb;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := '{}'::jsonb;
  end;
  return coalesce(claims->>'email', claims->>'sub', current_user);
end;
$function$;

-- 3) Avatars bucket is now private: keep read access scoped to owner/admin
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and admins can list avatars" ON storage.objects;
CREATE POLICY "Owners and admins can read avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );