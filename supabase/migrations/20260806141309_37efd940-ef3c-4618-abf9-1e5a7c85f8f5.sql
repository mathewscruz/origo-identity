-- Lock down internal backup tables and the IAM restore guardrail switch

ALTER TABLE public.backup_cargo_perfis_20260708 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_cargo_perfis_regex_fix_20260708 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_colaboradores_restore_20260707 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_perfil_atribuicoes_20260708 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_perfil_licencas_20260708 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_restore_guardrails ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.backup_cargo_perfis_20260708 FROM anon, authenticated;
REVOKE ALL ON public.backup_cargo_perfis_regex_fix_20260708 FROM anon, authenticated;
REVOKE ALL ON public.backup_colaboradores_restore_20260707 FROM anon, authenticated;
REVOKE ALL ON public.backup_perfil_atribuicoes_20260708 FROM anon, authenticated;
REVOKE ALL ON public.backup_perfil_licencas_20260708 FROM anon, authenticated;
REVOKE ALL ON public.iam_restore_guardrails FROM anon, authenticated;

GRANT SELECT ON public.backup_cargo_perfis_20260708 TO authenticated;
GRANT SELECT ON public.backup_cargo_perfis_regex_fix_20260708 TO authenticated;
GRANT SELECT ON public.backup_colaboradores_restore_20260707 TO authenticated;
GRANT SELECT ON public.backup_perfil_atribuicoes_20260708 TO authenticated;
GRANT SELECT ON public.backup_perfil_licencas_20260708 TO authenticated;
GRANT SELECT ON public.iam_restore_guardrails TO authenticated;

GRANT ALL ON public.backup_cargo_perfis_20260708 TO service_role;
GRANT ALL ON public.backup_cargo_perfis_regex_fix_20260708 TO service_role;
GRANT ALL ON public.backup_colaboradores_restore_20260707 TO service_role;
GRANT ALL ON public.backup_perfil_atribuicoes_20260708 TO service_role;
GRANT ALL ON public.backup_perfil_licencas_20260708 TO service_role;
GRANT ALL ON public.iam_restore_guardrails TO service_role;

CREATE POLICY "Admins podem ler backup_cargo_perfis_20260708"
  ON public.backup_cargo_perfis_20260708 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins podem ler backup_cargo_perfis_regex_fix_20260708"
  ON public.backup_cargo_perfis_regex_fix_20260708 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins podem ler backup_colaboradores_restore_20260707"
  ON public.backup_colaboradores_restore_20260707 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins podem ler backup_perfil_atribuicoes_20260708"
  ON public.backup_perfil_atribuicoes_20260708 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins podem ler backup_perfil_licencas_20260708"
  ON public.backup_perfil_licencas_20260708 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins podem ler iam_restore_guardrails"
  ON public.iam_restore_guardrails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Restore-suppression triggers must keep reading the guardrail flag regardless of RLS
CREATE OR REPLACE FUNCTION public.suppress_restore_colaborador_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.iam_restore_guardrails where id=true and active=true) then
    update public.colaboradores set status='desligado', updated_at=now() where id=old.id;
    return null;
  end if;
  return old;
end; $function$;

CREATE OR REPLACE FUNCTION public.suppress_restore_eventos_jml()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.iam_restore_guardrails where id=true and active=true)
     and new.origem = 'importacao_csv' then
    return null;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.suppress_restore_iam_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.iam_restore_guardrails where id=true and active=true)
     and new.requested_by = 'importacao_sharepoint' then
    return null;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.suppress_restore_perfil_atribuicoes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.iam_restore_guardrails where id=true and active=true)
     and coalesce(new.origem,'') = 'cargo' then
    return null;
  end if;
  return new;
end; $function$;