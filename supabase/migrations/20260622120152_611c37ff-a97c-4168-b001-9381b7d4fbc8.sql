
DROP POLICY IF EXISTS "App roles can select colaboradores" ON public.colaboradores;
CREATE POLICY "Admins and operadores can select colaboradores"
  ON public.colaboradores FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "App roles can select terceiros" ON public.terceiros;
CREATE POLICY "Admins and operadores can select terceiros"
  ON public.terceiros FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "App roles can select empresas" ON public.empresas;
CREATE POLICY "Admins and operadores can select empresas"
  ON public.empresas FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operador'::app_role));

DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
CREATE POLICY "Public can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can subscribe to non-sensitive realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to non-sensitive realtime topics"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() IN ('iam_queue', 'public:iam_queue')
        THEN public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operador'::app_role)
      ELSE true
    END
  );

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_app_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_revisao_by_token(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revisao_itens_by_token(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_revisao_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_revisao_itens_by_token(text) TO anon;
