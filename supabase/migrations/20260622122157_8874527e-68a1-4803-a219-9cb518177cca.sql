
-- Restrict SELECT on sensitive tables to admin/operador only
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'alertas','colab_quarentena','evento_jml_acoes','evento_jml_aprovacoes',
    'eventos_jml','excecoes','perfil_atribuicoes','regras','regra_condicoes',
    'regra_resultados','revisao_itens','revisoes','sync_jobs','workflow_execucoes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated can select %I" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Privileged can select %I" ON public.%I FOR SELECT TO authenticated USING (has_role(auth.uid(), ''admin''::app_role) OR has_role(auth.uid(), ''operador''::app_role))',
      t, t
    );
  END LOOP;
END $$;

-- solicitacao_itens: privileged OR owner of parent solicitacao
DROP POLICY IF EXISTS "Authenticated can select solicitacao_itens" ON public.solicitacao_itens;
DROP POLICY IF EXISTS "Privileged or owner can select solicitacao_itens" ON public.solicitacao_itens;
CREATE POLICY "Privileged or owner can select solicitacao_itens"
ON public.solicitacao_itens
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.solicitacoes_acesso s
    WHERE s.id = solicitacao_itens.solicitacao_id
      AND s.user_id = auth.uid()
  )
);

-- Storage: avatars bucket — remove public listing, keep public bucket CDN access.
-- Public buckets remain accessible via the public CDN URL even without a SELECT
-- policy on storage.objects. We restrict listing to the file's owner and admins.
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and admins can list avatars" ON storage.objects;
CREATE POLICY "Owners and admins can list avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'operador'::app_role)
  )
);
