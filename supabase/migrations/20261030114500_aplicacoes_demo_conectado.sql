-- Selo visual de demonstração, separado do estado técnico de integração e teste.
-- Não habilita conectores, perfis nem provisionamento.
DO $demo$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.aplicacoes
   WHERE (id,nome) IN (
     ('a108ba21-451e-47b5-8935-c698ee2add88'::uuid,'Atlas'),
     ('ec78fdbe-d9c9-4592-86d2-41fb94e95882'::uuid,'CMS'),
     ('19e0974f-9132-480c-ac1f-154da792ff1c'::uuid,'GLPI'),
     ('910ee197-cfd0-4b0b-94db-37c6210a4223'::uuid,'Power BI')
   ) AND integracao_ativa = false AND teste_status = 'pendente';
  IF n <> 4 THEN
    RAISE EXCEPTION 'Esperadas 4 aplicações de demo inativas/pendentes, encontradas %', n;
  END IF;
  ALTER TABLE public.aplicacoes ADD COLUMN IF NOT EXISTS demo_conectado boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.aplicacoes.demo_conectado IS 'Selo visual Conectado — demonstração; não representa conector, teste ou provisionamento IAM homologado.';
  UPDATE public.aplicacoes SET demo_conectado = true, updated_at = now()
   WHERE (id,nome) IN (
     ('a108ba21-451e-47b5-8935-c698ee2add88'::uuid,'Atlas'),
     ('ec78fdbe-d9c9-4592-86d2-41fb94e95882'::uuid,'CMS'),
     ('19e0974f-9132-480c-ac1f-154da792ff1c'::uuid,'GLPI'),
     ('910ee197-cfd0-4b0b-94db-37c6210a4223'::uuid,'Power BI')
   );
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'Atualização incompleta: % de 4', n; END IF;
END $demo$;
