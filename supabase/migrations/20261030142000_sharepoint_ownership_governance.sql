-- Owner metadata only: never infer site-admin rights or grant permissions.
CREATE TABLE IF NOT EXISTS public.sharepoint_site_group_links (
  site_db_id uuid PRIMARY KEY REFERENCES public.sharepoint_sites(id) ON DELETE RESTRICT,
  entra_group_id uuid NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'graph_group_sites_root',
  owner_count integer NOT NULL DEFAULT 0,
  owners_checked_at timestamptz NOT NULL,
  sync_status text NOT NULL DEFAULT 'complete',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sharepoint_site_group_owners (
  site_db_id uuid NOT NULL REFERENCES public.sharepoint_site_group_links(site_db_id) ON DELETE RESTRICT,
  owner_object_id uuid NOT NULL,
  owner_type text NOT NULL DEFAULT '#microsoft.graph.user',
  owner_upn text,
  owner_mail text,
  owner_display_name text,
  source text NOT NULL DEFAULT 'graph_group_owners',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (site_db_id, owner_object_id)
);
CREATE INDEX IF NOT EXISTS sharepoint_site_group_owners_by_object ON public.sharepoint_site_group_owners(owner_object_id) WHERE active;
ALTER TABLE public.sharepoint_site_group_links ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.sharepoint_site_group_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharepoint_site_group_owners ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sharepoint_site_group_links, public.sharepoint_site_group_owners TO authenticated;
GRANT ALL ON public.sharepoint_site_group_links, public.sharepoint_site_group_owners TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sharepoint_site_group_links' AND policyname='Admins e operadores consultam grupo SharePoint') THEN
    CREATE POLICY "Admins e operadores consultam grupo SharePoint" ON public.sharepoint_site_group_links FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sharepoint_site_group_owners' AND policyname='Admins e operadores consultam donos SharePoint') THEN
    CREATE POLICY "Admins e operadores consultam donos SharePoint" ON public.sharepoint_site_group_owners FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sharepoint_site_ownership_coverage (
  site_db_id uuid PRIMARY KEY REFERENCES public.sharepoint_sites(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('group_owners','group_without_owner','group_not_discovered')),
  source text NOT NULL DEFAULT 'graph_unified_group_inventory',
  verified_at timestamptz NOT NULL,
  site_admin_status text NOT NULL DEFAULT 'not_collected' CHECK (site_admin_status IN ('not_collected','verified','error')),
  direct_permission_status text NOT NULL DEFAULT 'not_collected' CHECK (direct_permission_status IN ('not_collected','verified','error')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sharepoint_ownership_coverage_status ON public.sharepoint_site_ownership_coverage(status);
CREATE TABLE IF NOT EXISTS public.sharepoint_ownership_sync_runs (
  id uuid PRIMARY KEY,
  collected_at timestamptz NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  group_count integer NOT NULL,
  site_count integer NOT NULL,
  link_count integer NOT NULL,
  owner_count integer NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sharepoint_ownership_batches (
  run_id uuid NOT NULL,
  batch_no integer NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (run_id, batch_no)
);
REVOKE ALL ON public.sharepoint_ownership_batches FROM PUBLIC, anon, authenticated;
ALTER TABLE public.sharepoint_site_ownership_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharepoint_ownership_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharepoint_ownership_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.sharepoint_site_ownership_coverage, public.sharepoint_ownership_sync_runs TO authenticated;
GRANT ALL ON public.sharepoint_site_ownership_coverage, public.sharepoint_ownership_sync_runs, public.sharepoint_ownership_batches TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sharepoint_site_ownership_coverage' AND policyname='Operadores consultam cobertura SharePoint') THEN
    CREATE POLICY "Operadores consultam cobertura SharePoint" ON public.sharepoint_site_ownership_coverage FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sharepoint_ownership_sync_runs' AND policyname='Operadores consultam ciclos SharePoint') THEN
    CREATE POLICY "Operadores consultam ciclos SharePoint" ON public.sharepoint_ownership_sync_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_sharepoint_ownership_snapshot(
  p_run uuid, p_group_count integer, p_sites integer, p_links integer, p_owners integer, p_collected_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_count integer;
  v_links integer;
  v_owners integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sharepoint_ownership_sync_runs WHERE id=p_run) THEN
    RAISE EXCEPTION 'Snapshot already applied';
  END IF;
  IF p_group_count < 900 OR p_sites < (SELECT count(*) FROM public.sharepoint_sites)
     OR p_links < (SELECT greatest(900, count(*) * 8 / 10) FROM public.sharepoint_site_group_links WHERE active)
     OR p_collected_at > now() + interval '5 minutes' OR p_collected_at < now() - interval '3 days' THEN
    RAISE EXCEPTION 'Invalid snapshot metadata';
  END IF;
  SELECT jsonb_agg(x.value) INTO v_rows
  FROM public.sharepoint_ownership_batches b CROSS JOIN LATERAL jsonb_array_elements(b.payload) AS x(value)
  WHERE b.run_id=p_run;
  v_count := coalesce(jsonb_array_length(v_rows),0);
  IF v_count <> p_sites OR (SELECT count(DISTINCT x.value->>'site_id') FROM jsonb_array_elements(v_rows) AS x(value)) <> p_sites
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) AS x(value) WHERE nullif(x.value->>'site_id','') IS NULL OR jsonb_typeof(x.value->'owners') <> 'array') THEN
    RAISE EXCEPTION 'Incomplete or duplicate site inventory';
  END IF;
  SELECT count(*), coalesce(sum(jsonb_array_length(x.value->'owners')),0)
    INTO v_links,v_owners FROM jsonb_array_elements(v_rows) AS x(value) WHERE x.value->>'group_id' IS NOT NULL;
  IF v_links <> p_links OR v_owners <> p_owners OR
     p_group_count < p_links OR
     (SELECT count(DISTINCT x.value->>'group_id') FROM jsonb_array_elements(v_rows) AS x(value) WHERE x.value->>'group_id' IS NOT NULL) <> p_links OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) AS x(value)
       WHERE (x.value->>'status' IS DISTINCT FROM CASE
                WHEN nullif(x.value->>'group_id','') IS NULL THEN 'group_not_discovered'
                WHEN jsonb_array_length(x.value->'owners') > 0 THEN 'group_owners'
                ELSE 'group_without_owner' END)) THEN
    RAISE EXCEPTION 'Owner/group snapshot inconsistent';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT y.value->>'id' owner_id, x.value->>'site_id' site_id, count(*) n
     FROM jsonb_array_elements(v_rows) AS x(value) CROSS JOIN LATERAL jsonb_array_elements(x.value->'owners') y(value)
     GROUP BY 1,2 HAVING count(*)>1 OR min(y.value->>'id') IS NULL) dup) THEN
    RAISE EXCEPTION 'Duplicate or unidentified owner';
  END IF;
  -- A partial Graph response must never deactivate previous owners. The caller
  -- validates every page/status before staging; the transaction checks counts.
  INSERT INTO public.sharepoint_sites(site_id,nome,url)
  SELECT x.value->>'site_id', coalesce(nullif(x.value->>'nome',''),x.value->>'site_id'),x.value->>'url'
  FROM jsonb_array_elements(v_rows) AS x(value)
  ON CONFLICT (site_id) DO NOTHING;
  UPDATE public.sharepoint_site_group_links SET active=false,updated_at=now()
    WHERE active AND site_db_id IN (SELECT s.id FROM public.sharepoint_sites s JOIN jsonb_array_elements(v_rows) AS x(value) ON s.site_id=x.value->>'site_id')
      AND site_db_id NOT IN (SELECT s.id FROM public.sharepoint_sites s JOIN jsonb_array_elements(v_rows) AS x(value) ON s.site_id=x.value->>'site_id' WHERE x.value->>'group_id' IS NOT NULL);
  INSERT INTO public.sharepoint_site_group_links(site_db_id,entra_group_id,owner_count,owners_checked_at,active,updated_at)
  SELECT s.id,(x.value->>'group_id')::uuid,jsonb_array_length(x.value->'owners'),p_collected_at,true,now()
  FROM jsonb_array_elements(v_rows) AS x(value) JOIN public.sharepoint_sites s ON s.site_id=x.value->>'site_id'
  WHERE x.value->>'group_id' IS NOT NULL
  ON CONFLICT (site_db_id) DO UPDATE SET entra_group_id=EXCLUDED.entra_group_id,owner_count=EXCLUDED.owner_count,
    owners_checked_at=EXCLUDED.owners_checked_at,active=true,updated_at=now();
  UPDATE public.sharepoint_site_group_owners o SET active=false
    WHERE o.active AND o.site_db_id IN (SELECT s.id FROM public.sharepoint_sites s JOIN jsonb_array_elements(v_rows) AS x(value) ON s.site_id=x.value->>'site_id')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) AS x(value)
        JOIN public.sharepoint_sites s ON s.site_id=x.value->>'site_id'
        CROSS JOIN LATERAL jsonb_array_elements(x.value->'owners') y(value)
        WHERE s.id=o.site_db_id AND y.value->>'id'=o.owner_object_id::text);
  INSERT INTO public.sharepoint_site_group_owners(site_db_id,owner_object_id,owner_type,owner_upn,owner_mail,owner_display_name,last_seen_at,active)
  SELECT s.id,(y.value->>'id')::uuid,coalesce(y.value->>'type','unknown'),y.value->>'upn',y.value->>'mail',y.value->>'display_name',p_collected_at,true
  FROM jsonb_array_elements(v_rows) AS x(value) JOIN public.sharepoint_sites s ON s.site_id=x.value->>'site_id'
  CROSS JOIN LATERAL jsonb_array_elements(x.value->'owners') y(value)
  ON CONFLICT (site_db_id,owner_object_id) DO UPDATE SET owner_type=EXCLUDED.owner_type,owner_upn=EXCLUDED.owner_upn,
    owner_mail=EXCLUDED.owner_mail,owner_display_name=EXCLUDED.owner_display_name,last_seen_at=EXCLUDED.last_seen_at,active=true;
  INSERT INTO public.sharepoint_site_ownership_coverage(site_db_id,status,verified_at,updated_at)
  SELECT s.id,x.value->>'status',p_collected_at,now()
  FROM jsonb_array_elements(v_rows) AS x(value) JOIN public.sharepoint_sites s ON s.site_id=x.value->>'site_id'
  ON CONFLICT (site_db_id) DO UPDATE SET status=EXCLUDED.status,verified_at=EXCLUDED.verified_at,updated_at=now();
  INSERT INTO public.sharepoint_ownership_sync_runs(id,collected_at,group_count,site_count,link_count,owner_count)
    VALUES(p_run,p_collected_at,p_group_count,p_sites,p_links,p_owners);
  DELETE FROM public.sharepoint_ownership_batches WHERE run_id=p_run;
  RETURN jsonb_build_object('sites',p_sites,'links',p_links,'owners',p_owners);
END $$;
REVOKE ALL ON FUNCTION public.apply_sharepoint_ownership_snapshot(uuid,integer,integer,integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sharepoint_ownership_snapshot(uuid,integer,integer,integer,integer,timestamptz) TO service_role;
