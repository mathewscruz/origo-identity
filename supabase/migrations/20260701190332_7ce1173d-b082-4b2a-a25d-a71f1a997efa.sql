
-- FK CASCADE for eventos_jml.colaborador_id
ALTER TABLE public.eventos_jml
  DROP CONSTRAINT IF EXISTS eventos_jml_colaborador_id_fkey;
ALTER TABLE public.eventos_jml
  ADD CONSTRAINT eventos_jml_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE;

-- Revoke public execute on internal SECURITY DEFINER functions (triggers / service-role only)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.iam_queue_apply_approval_gate() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.apply_reconcile_updates(jsonb, jsonb) TO service_role;
