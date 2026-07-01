-- 1. Colunas de auditoria de aprovação na fila
ALTER TABLE public.iam_queue
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2. Índice para listagem rápida dos itens aguardando aprovação
CREATE INDEX IF NOT EXISTS idx_iam_queue_waiting_approval
  ON public.iam_queue (created_at DESC)
  WHERE status = 'waiting_approval';

-- 3. Parâmetro global (upsert)
INSERT INTO public.parametros (chave, valor, descricao)
VALUES ('iam_approval_required', 'true', 'Exigir aprovação manual antes de executar qualquer ação IAM (criação, alteração, exclusão, grupos, licenças, apps).')
ON CONFLICT (chave) DO NOTHING;

-- 4. Trigger: aplica gate na inserção
CREATE OR REPLACE FUNCTION public.iam_queue_apply_approval_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate_on boolean := false;
BEGIN
  -- Só intercepta itens que entrariam como 'pending' (não mexe em success/failed/cancelled já pré-marcados)
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((valor = 'true'), false) INTO gate_on
  FROM public.parametros WHERE chave = 'iam_approval_required';

  IF gate_on THEN
    NEW.status := 'waiting_approval';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iam_queue_apply_approval_gate ON public.iam_queue;
CREATE TRIGGER trg_iam_queue_apply_approval_gate
  BEFORE INSERT ON public.iam_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.iam_queue_apply_approval_gate();