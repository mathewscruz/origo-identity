-- Sidecar only: never mutate NEW.detalhes (writers compare exact readback).
CREATE TABLE IF NOT EXISTS public.rh_audit_person_snapshots (
 audit_id uuid PRIMARY KEY REFERENCES public.auditoria(id),
 pessoa_id text NOT NULL,
 pessoa text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.rh_audit_person_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rh_audit_person_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rh_audit_person_snapshots TO authenticated;
GRANT ALL ON public.rh_audit_person_snapshots TO service_role;
DROP POLICY IF EXISTS rh_audit_snapshot_read ON public.rh_audit_person_snapshots;
CREATE POLICY rh_audit_snapshot_read ON public.rh_audit_person_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operador'::public.app_role));
CREATE OR REPLACE FUNCTION public.rh_audit_person_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE person_name text;
BEGIN
 IF NEW.acao IN ('rh_cadastral_incremental','rh_desligamento_escopo14','rh_desligamento_cloud_verificado','rh_operation_verified')
 AND NEW.entidade IN ('colaboradores','colaborador') THEN
  SELECT nome INTO person_name FROM public.colaboradores WHERE id::text=NEW.entidade_id;
  IF person_name IS NOT NULL THEN
   INSERT INTO public.rh_audit_person_snapshots(audit_id,pessoa_id,pessoa)
   VALUES(NEW.id,NEW.entidade_id,person_name) ON CONFLICT(audit_id) DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.rh_audit_person_snapshot() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER trg_rh_audit_person_snapshot AFTER INSERT ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.rh_audit_person_snapshot();
-- Names observed now, not invented historical names/times. Original audit timestamp preserved.
INSERT INTO public.rh_audit_person_snapshots(audit_id,pessoa_id,pessoa)
SELECT a.id,a.entidade_id,COALESCE(a.detalhes->>'pessoa',a.detalhes->>'nome',c.nome)
FROM public.auditoria a JOIN public.colaboradores c ON c.id::text=a.entidade_id
WHERE a.acao IN ('rh_cadastral_incremental','rh_desligamento_escopo14','rh_desligamento_cloud_verificado','rh_operation_verified')
AND a.entidade IN ('colaboradores','colaborador') ON CONFLICT(audit_id) DO NOTHING;
NOTIFY pgrst,'reload schema';
