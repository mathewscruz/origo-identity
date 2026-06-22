
-- =========================================================
-- 1) workflow_fluxos
-- =========================================================
CREATE TABLE IF NOT EXISTS public.workflow_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  escopo text NOT NULL CHECK (escopo IN ('solicitacao','excecao','jml')),
  is_default boolean NOT NULL DEFAULT false,
  prioridade int NOT NULL DEFAULT 100,
  filtro_aplicacao_ids uuid[] NOT NULL DEFAULT '{}',
  filtro_perfil_ids uuid[] NOT NULL DEFAULT '{}',
  filtro_licenca_ids uuid[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_fluxos TO authenticated;
GRANT ALL ON public.workflow_fluxos TO service_role;

ALTER TABLE public.workflow_fluxos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_fluxos_select_auth" ON public.workflow_fluxos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_fluxos_admin_insert" ON public.workflow_fluxos
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wf_fluxos_admin_update" ON public.workflow_fluxos
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wf_fluxos_admin_delete" ON public.workflow_fluxos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_wf_fluxos_updated
  BEFORE UPDATE ON public.workflow_fluxos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) workflow_etapas — reformulada
-- =========================================================
-- Adiciona colunas novas, mantendo aprovador_tipo durante migração
ALTER TABLE public.workflow_etapas
  ADD COLUMN IF NOT EXISTS fluxo_id uuid REFERENCES public.workflow_fluxos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS tipo_aprovador text
    CHECK (tipo_aprovador IN ('gestor_direto','owner_recurso','usuario_especifico','papel')),
  ADD COLUMN IF NOT EXISTS papel public.app_role,
  ADD COLUMN IF NOT EXISTS modo_aprovacao text
    CHECK (modo_aprovacao IN ('qualquer_um','todos')),
  ADD COLUMN IF NOT EXISTS acao_timeout text
    CHECK (acao_timeout IN ('escalar_proxima','auto_aprovar','auto_rejeitar')) DEFAULT 'escalar_proxima';

-- Migra configurações existentes (se houver) para um fluxo legado por escopo
DO $$
DECLARE
  v_escopo text;
  v_fluxo_id uuid;
BEGIN
  FOR v_escopo IN
    SELECT DISTINCT entidade_tipo FROM public.workflow_etapas WHERE entidade_tipo IS NOT NULL
  LOOP
    IF v_escopo IN ('solicitacao','excecao') THEN
      INSERT INTO public.workflow_fluxos (nome, escopo, is_default, prioridade, ativo)
      VALUES ('Fluxo legado — ' || v_escopo, v_escopo, false, 500, false)
      RETURNING id INTO v_fluxo_id;

      UPDATE public.workflow_etapas
        SET fluxo_id = v_fluxo_id,
            nome = COALESCE(nome, 'Etapa ' || ordem),
            tipo_aprovador = COALESCE(tipo_aprovador, CASE
              WHEN aprovador_tipo = 'gestor' THEN 'gestor_direto'
              WHEN aprovador_tipo = 'owner' THEN 'owner_recurso'
              WHEN aprovador_tipo = 'ti'    THEN 'papel'
              ELSE 'owner_recurso'
            END),
            papel = COALESCE(papel, CASE WHEN aprovador_tipo='ti' THEN 'admin'::public.app_role ELSE NULL END),
            modo_aprovacao = COALESCE(modo_aprovacao, 'qualquer_um')
       WHERE entidade_tipo = v_escopo;
    END IF;
  END LOOP;
END $$;

-- Define defaults para colunas novas
ALTER TABLE public.workflow_etapas
  ALTER COLUMN modo_aprovacao SET DEFAULT 'qualquer_um';

-- Solta colunas/constraints antigas
ALTER TABLE public.workflow_etapas
  DROP COLUMN IF EXISTS entidade_tipo,
  DROP COLUMN IF EXISTS aprovador_tipo;

-- =========================================================
-- 3) workflow_etapa_aprovadores (nominais)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.workflow_etapa_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.workflow_etapas(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_etapa_aprovadores TO authenticated;
GRANT ALL ON public.workflow_etapa_aprovadores TO service_role;

ALTER TABLE public.workflow_etapa_aprovadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_apr_select_auth" ON public.workflow_etapa_aprovadores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_apr_admin_insert" ON public.workflow_etapa_aprovadores
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wf_apr_admin_update" ON public.workflow_etapa_aprovadores
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wf_apr_admin_delete" ON public.workflow_etapa_aprovadores
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 4) solicitacoes_acesso — vínculo com fluxo
-- =========================================================
ALTER TABLE public.solicitacoes_acesso
  ADD COLUMN IF NOT EXISTS fluxo_id uuid REFERENCES public.workflow_fluxos(id),
  ADD COLUMN IF NOT EXISTS etapa_atual_ordem int;

-- =========================================================
-- 5) workflow_execucoes — instância por decisão
-- =========================================================
ALTER TABLE public.workflow_execucoes
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.solicitacoes_acesso(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ordem int,
  ADD COLUMN IF NOT EXISTS aprovador_email text;

CREATE INDEX IF NOT EXISTS idx_wf_exec_solic ON public.workflow_execucoes(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_aprov_email ON public.workflow_execucoes(aprovador_email);
CREATE INDEX IF NOT EXISTS idx_wf_etapas_fluxo ON public.workflow_etapas(fluxo_id, ordem);

-- =========================================================
-- 6) Seed: fluxo padrão "Aprovação pelo Owner do Recurso"
-- =========================================================
DO $$
DECLARE
  v_fluxo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workflow_fluxos WHERE escopo='solicitacao' AND is_default=true) THEN
    INSERT INTO public.workflow_fluxos (nome, descricao, escopo, is_default, prioridade, ativo)
    VALUES (
      'Aprovação pelo Owner do Recurso',
      'Fluxo padrão: cada item da solicitação é aprovado pelo owner cadastrado da aplicação, grupo ou licença.',
      'solicitacao', true, 1000, true
    )
    RETURNING id INTO v_fluxo_id;

    INSERT INTO public.workflow_etapas (fluxo_id, ordem, nome, tipo_aprovador, modo_aprovacao, timeout_horas, acao_timeout, ativo)
    VALUES (v_fluxo_id, 1, 'Aprovação do Owner', 'owner_recurso', 'qualquer_um', 48, 'escalar_proxima', true);
  END IF;
END $$;
