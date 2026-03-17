
-- =============================================
-- ÓRIGO IDENTITY — SCHEMA COMPLETO
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'viewer');
CREATE TYPE public.status_colaborador AS ENUM ('ativo', 'inativo', 'ferias', 'afastado', 'desligado');
CREATE TYPE public.criticidade AS ENUM ('baixa', 'media', 'alta', 'critica');
CREATE TYPE public.tipo_evento_jml AS ENUM ('joiner', 'mover', 'leaver');
CREATE TYPE public.status_evento_jml AS ENUM ('pendente', 'quarentena', 'executando', 'executado', 'erro', 'cancelado');
CREATE TYPE public.status_excecao AS ENUM ('pendente', 'aprovada', 'rejeitada', 'expirada');
CREATE TYPE public.status_revisao AS ENUM ('em_andamento', 'concluida', 'cancelada');
CREATE TYPE public.sensibilidade_perfil AS ENUM ('baixa', 'media', 'alta', 'critica');
CREATE TYPE public.tipo_perfil AS ENUM ('funcional', 'tecnico', 'privilegiado');
CREATE TYPE public.status_regra AS ENUM ('ativa', 'inativa', 'rascunho');
CREATE TYPE public.severidade_alerta AS ENUM ('info', 'aviso', 'critico');

-- 2. USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. HAS_ROLE FUNCTION
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- CONFIG TABLES
-- =============================================

-- EMPRESAS
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LOCALIDADES
CREATE TABLE public.localidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_localidades_updated_at BEFORE UPDATE ON public.localidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AREAS
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CARGOS
CREATE TABLE public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_cargos_updated_at BEFORE UPDATE ON public.cargos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OPERADORES
CREATE TABLE public.operadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_operadores_updated_at BEFORE UPDATE ON public.operadores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PARAMETROS
CREATE TABLE public.parametros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_parametros_updated_at BEFORE UPDATE ON public.parametros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- CORE TABLES
-- =============================================

-- COLABORADORES
CREATE TABLE public.colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  matricula TEXT,
  cpf TEXT,
  status status_colaborador NOT NULL DEFAULT 'ativo',
  cargo_id UUID REFERENCES public.cargos(id) ON DELETE SET NULL,
  area_id UUID REFERENCES public.areas(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  localidade_id UUID REFERENCES public.localidades(id) ON DELETE SET NULL,
  gestor_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  data_admissao DATE,
  data_desligamento DATE,
  origem TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_colaboradores_updated_at BEFORE UPDATE ON public.colaboradores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TERCEIROS
CREATE TABLE public.terceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  empresa_terceira TEXT,
  criticidade criticidade NOT NULL DEFAULT 'media',
  responsavel TEXT,
  contrato_inicio DATE,
  contrato_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.terceiros ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_terceiros_updated_at BEFORE UPDATE ON public.terceiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- APLICACOES
CREATE TABLE public.aplicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  criticidade criticidade NOT NULL DEFAULT 'media',
  tipo_auth TEXT,
  owner TEXT,
  aprovacao_necessaria BOOLEAN NOT NULL DEFAULT false,
  integracao_ativa BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.aplicacoes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_aplicacoes_updated_at BEFORE UPDATE ON public.aplicacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PERFIS DE ACESSO
CREATE TABLE public.perfis_acesso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  aplicacao_id UUID REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  sensibilidade sensibilidade_perfil NOT NULL DEFAULT 'media',
  tipo tipo_perfil NOT NULL DEFAULT 'funcional',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.perfis_acesso ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_perfis_acesso_updated_at BEFORE UPDATE ON public.perfis_acesso FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PERFIL COMPOSICAO (items dentro de um perfil)
CREATE TABLE public.perfil_composicao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'aplicacao', 'grupo', 'licenca'
  nome TEXT NOT NULL,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.perfil_composicao ENABLE ROW LEVEL SECURITY;

-- ATRIBUICAO DE PERFIS A PESSOAS
CREATE TABLE public.perfil_atribuicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id UUID NOT NULL REFERENCES public.perfis_acesso(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  terceiro_id UUID REFERENCES public.terceiros(id) ON DELETE CASCADE,
  origem TEXT DEFAULT 'regra', -- 'regra', 'manual', 'excecao'
  data_concessao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_revogacao TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.perfil_atribuicoes ENABLE ROW LEVEL SECURITY;

-- =============================================
-- MOTOR DE REGRAS
-- =============================================

CREATE TABLE public.regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  status status_regra NOT NULL DEFAULT 'rascunho',
  prioridade INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  atualizado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.regras ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_regras_updated_at BEFORE UPDATE ON public.regras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.regra_condicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id UUID NOT NULL REFERENCES public.regras(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  operador TEXT NOT NULL,
  valor TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.regra_condicoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.regra_resultados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id UUID NOT NULL REFERENCES public.regras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'conceder_perfil', 'revogar_perfil', 'exigir_aprovacao', 'bloquear'
  perfil_id UUID REFERENCES public.perfis_acesso(id) ON DELETE SET NULL,
  detalhe TEXT,
  ordem INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.regra_resultados ENABLE ROW LEVEL SECURITY;

-- =============================================
-- EVENTOS JML
-- =============================================

CREATE TABLE public.eventos_jml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_evento_jml NOT NULL,
  status status_evento_jml NOT NULL DEFAULT 'pendente',
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  origem TEXT DEFAULT 'importacao',
  tentativas INTEGER NOT NULL DEFAULT 0,
  max_tentativas INTEGER NOT NULL DEFAULT 3,
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eventos_jml ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_eventos_jml_updated_at BEFORE UPDATE ON public.eventos_jml FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.evento_jml_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES public.eventos_jml(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  aplicacao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  executado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evento_jml_acoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.evento_jml_aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES public.eventos_jml(id) ON DELETE CASCADE,
  etapa INTEGER NOT NULL DEFAULT 1,
  aprovador TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  comentario TEXT,
  data_decisao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evento_jml_aprovacoes ENABLE ROW LEVEL SECURITY;

-- =============================================
-- EXCEÇÕES
-- =============================================

CREATE TABLE public.excecoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante TEXT NOT NULL,
  colaborador_nome TEXT,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  perfil_solicitado TEXT,
  perfil_id UUID REFERENCES public.perfis_acesso(id) ON DELETE SET NULL,
  justificativa TEXT NOT NULL,
  status status_excecao NOT NULL DEFAULT 'pendente',
  aprovador TEXT,
  data_decisao TIMESTAMPTZ,
  validade DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.excecoes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_excecoes_updated_at BEFORE UPDATE ON public.excecoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- REVISÕES (CAMPANHAS DE CERTIFICAÇÃO)
-- =============================================

CREATE TABLE public.revisoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  status status_revisao NOT NULL DEFAULT 'em_andamento',
  responsavel TEXT,
  data_inicio DATE,
  data_fim DATE,
  total_itens INTEGER NOT NULL DEFAULT 0,
  itens_revisados INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revisoes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_revisoes_updated_at BEFORE UPDATE ON public.revisoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.revisao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revisao_id UUID NOT NULL REFERENCES public.revisoes(id) ON DELETE CASCADE,
  colaborador_nome TEXT,
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  perfil_nome TEXT,
  perfil_id UUID REFERENCES public.perfis_acesso(id) ON DELETE SET NULL,
  decisao TEXT, -- 'manter', 'revogar', null
  justificativa TEXT,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revisao_itens ENABLE ROW LEVEL SECURITY;

-- =============================================
-- LICENÇAS
-- =============================================

CREATE TABLE public.licencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id UUID REFERENCES public.aplicacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'SaaS',
  total INTEGER NOT NULL DEFAULT 0,
  em_uso INTEGER NOT NULL DEFAULT 0,
  custo_unitario NUMERIC(10,2),
  renovacao DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.licencas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_licencas_updated_at BEFORE UPDATE ON public.licencas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUDITORIA
-- =============================================

CREATE TABLE public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  operador TEXT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  resumo TEXT,
  ip TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ALERTAS
-- =============================================

CREATE TABLE public.alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  severidade severidade_alerta NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL,
  mensagem TEXT,
  ref_tipo TEXT,
  ref_id TEXT,
  ref_url TEXT,
  lido BOOLEAN NOT NULL DEFAULT false,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES — Authenticated users can read all, admins can write
-- =============================================

-- Helper: read for all authenticated
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'empresas','localidades','areas','cargos','operadores','parametros',
      'colaboradores','terceiros','aplicacoes','perfis_acesso','perfil_composicao',
      'perfil_atribuicoes','regras','regra_condicoes','regra_resultados',
      'eventos_jml','evento_jml_acoes','evento_jml_aprovacoes',
      'excecoes','revisoes','revisao_itens','licencas','auditoria','alertas'
    ])
  LOOP
    EXECUTE format('CREATE POLICY "Authenticated can select %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "Admins can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''operador''))', tbl);
    EXECUTE format('CREATE POLICY "Admins can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''operador''))', tbl);
    EXECUTE format('CREATE POLICY "Admins can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''))', tbl);
  END LOOP;
END $$;

-- user_roles: only admins manage
CREATE POLICY "Authenticated can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- SEED DATA
-- =============================================

-- Empresas
INSERT INTO public.empresas (id, nome, cnpj) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Órigo Matriz', '12.345.678/0001-00'),
  ('a0000000-0000-0000-0000-000000000002', 'Órigo Filial SP', '12.345.678/0002-00');

-- Localidades
INSERT INTO public.localidades (id, nome, empresa_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Sede – São Paulo', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Filial Campinas', 'a0000000-0000-0000-0000-000000000002');

-- Areas
INSERT INTO public.areas (id, nome, empresa_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Recursos Humanos', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'Tecnologia', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'Financeiro', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000004', 'Dados & BI', 'a0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000005', 'Jurídico', 'a0000000-0000-0000-0000-000000000001');

-- Cargos
INSERT INTO public.cargos (id, nome, area_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Analista de RH', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'Gerente de TI', 'c0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000003', 'Coordenador Financeiro', 'c0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000004', 'Desenvolvedor Backend', 'c0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000005', 'Analista de Dados', 'c0000000-0000-0000-0000-000000000004');

-- Operadores
INSERT INTO public.operadores (id, nome, email) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'João IAM', 'joao.iam@origo.com'),
  ('e0000000-0000-0000-0000-000000000002', 'Maria Owner', 'maria.owner@origo.com'),
  ('e0000000-0000-0000-0000-000000000003', 'Admin Principal', 'admin@origo.com');

-- Parametros
INSERT INTO public.parametros (id, chave, valor, descricao) VALUES
  (gen_random_uuid(), 'max_tentativas_jml', '3', 'Máximo de tentativas para eventos JML'),
  (gen_random_uuid(), 'dias_alerta_contrato', '30', 'Dias antes do vencimento para alertar'),
  (gen_random_uuid(), 'aprovacao_dupla_leaver', 'true', 'Exigir dupla aprovação para leavers'),
  (gen_random_uuid(), 'importacao_automatica', 'true', 'Importação automática do 2Easy');

-- Colaboradores
INSERT INTO public.colaboradores (id, nome, email, matricula, status, cargo_id, area_id, empresa_id, localidade_id, data_admissao) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'Ana Silva', 'ana.silva@origo.com', 'MAT-001', 'ativo', 'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2020-03-15'),
  ('f0000000-0000-0000-0000-000000000002', 'Carlos Souza', 'carlos.souza@origo.com', 'MAT-002', 'ativo', 'd0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2019-01-10'),
  ('f0000000-0000-0000-0000-000000000003', 'Maria Oliveira', 'maria.oliveira@origo.com', 'MAT-003', 'desligado', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2018-06-01'),
  ('f0000000-0000-0000-0000-000000000004', 'Pedro Costa', 'pedro.costa@origo.com', 'MAT-004', 'ativo', 'd0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2021-09-20'),
  ('f0000000-0000-0000-0000-000000000005', 'Lucia Ferreira', 'lucia.ferreira@origo.com', 'MAT-005', 'ferias', 'd0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '2022-02-14'),
  ('f0000000-0000-0000-0000-000000000006', 'Roberto Almeida', 'roberto.almeida@origo.com', 'MAT-006', 'ativo', 'd0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2023-05-08');

-- Terceiros
INSERT INTO public.terceiros (id, nome, email, empresa_terceira, criticidade, responsavel, contrato_inicio, contrato_fim) VALUES
  ('70000000-0000-0000-0000-000000000001', 'Marcos Vieira', 'marcos@secureit.com', 'SecureIT', 'critica', 'João IAM', '2025-03-20', '2026-03-20'),
  ('70000000-0000-0000-0000-000000000002', 'Ricardo Mendes', 'ricardo@techconsult.com', 'TechConsult', 'alta', 'Maria Owner', '2025-06-01', '2026-03-24'),
  ('70000000-0000-0000-0000-000000000003', 'Fernanda Lima', 'fernanda@datapartner.com', 'DataPartner', 'media', 'Pedro Costa', '2025-01-01', '2026-12-31');

-- Aplicacoes
INSERT INTO public.aplicacoes (id, nome, criticidade, tipo_auth, owner, aprovacao_necessaria, integracao_ativa) VALUES
  ('80000000-0000-0000-0000-000000000001', 'Microsoft 365', 'critica', 'SSO Entra', 'Maria Owner', true, true),
  ('80000000-0000-0000-0000-000000000002', 'SAP ERP', 'critica', 'SAML', 'João IAM', true, false),
  ('80000000-0000-0000-0000-000000000003', 'Jira', 'alta', 'SSO Entra', 'Maria Owner', false, true),
  ('80000000-0000-0000-0000-000000000004', 'Slack', 'media', 'SSO Entra', 'João IAM', false, true),
  ('80000000-0000-0000-0000-000000000005', 'Portal Interno', 'baixa', 'Local', 'Admin', false, false),
  ('80000000-0000-0000-0000-000000000006', 'AWS Console', 'critica', 'SSO Entra', 'Pedro Costa', true, true),
  ('80000000-0000-0000-0000-000000000007', 'Datadog', 'alta', 'SSO Entra', 'João IAM', false, true);

-- Perfis de Acesso
INSERT INTO public.perfis_acesso (id, nome, descricao, aplicacao_id, sensibilidade, tipo) VALUES
  ('90000000-0000-0000-0000-000000000001', 'M365 Básico', 'Acesso básico ao Microsoft 365', '80000000-0000-0000-0000-000000000001', 'baixa', 'funcional'),
  ('90000000-0000-0000-0000-000000000002', 'SAP Financeiro', 'Módulo financeiro do SAP', '80000000-0000-0000-0000-000000000002', 'critica', 'funcional'),
  ('90000000-0000-0000-0000-000000000003', 'Jira Developer', 'Acesso dev ao Jira', '80000000-0000-0000-0000-000000000003', 'media', 'tecnico'),
  ('90000000-0000-0000-0000-000000000004', 'AWS Admin', 'Administrador AWS', '80000000-0000-0000-0000-000000000006', 'critica', 'privilegiado'),
  ('90000000-0000-0000-0000-000000000005', 'Slack Standard', 'Acesso padrão Slack', '80000000-0000-0000-0000-000000000004', 'baixa', 'funcional'),
  ('90000000-0000-0000-0000-000000000006', 'Datadog Pro', 'Monitoramento avançado', '80000000-0000-0000-0000-000000000007', 'alta', 'tecnico');

-- Regras
INSERT INTO public.regras (id, nome, descricao, status, prioridade, criado_por) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'RH → M365 + SAP Financeiro', 'Concede acesso M365 e SAP para área de RH', 'ativa', 10, 'João IAM'),
  ('aa000000-0000-0000-0000-000000000002', 'Tecnologia → Jira + Slack + AWS', 'Acesso dev para área de tecnologia', 'ativa', 20, 'João IAM'),
  ('aa000000-0000-0000-0000-000000000003', 'Financeiro → SAP Financeiro', 'SAP para coordenadores financeiros', 'ativa', 15, 'Maria Owner'),
  ('aa000000-0000-0000-0000-000000000004', 'Terceiro Crítico → Aprovação Owner', 'Terceiros críticos exigem aprovação do owner', 'ativa', 5, 'Maria Owner'),
  ('aa000000-0000-0000-0000-000000000005', 'Todos → Slack Standard', 'Slack para todos os colaboradores', 'rascunho', 50, 'João IAM');

-- Regra condicoes
INSERT INTO public.regra_condicoes (id, regra_id, campo, operador, valor, ordem) VALUES
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001', 'area', 'igual', 'Recursos Humanos', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002', 'area', 'igual', 'Tecnologia', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000003', 'area', 'igual', 'Financeiro', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000003', 'cargo', 'igual', 'Coordenador Financeiro', 2),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000004', 'tipo_pessoa', 'igual', 'terceiro', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000004', 'criticidade', 'igual', 'critica', 2);

-- Regra resultados
INSERT INTO public.regra_resultados (id, regra_id, tipo, perfil_id, ordem) VALUES
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001', 'conceder_perfil', '90000000-0000-0000-0000-000000000001', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001', 'conceder_perfil', '90000000-0000-0000-0000-000000000002', 2),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002', 'conceder_perfil', '90000000-0000-0000-0000-000000000003', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002', 'conceder_perfil', '90000000-0000-0000-0000-000000000005', 2),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002', 'conceder_perfil', '90000000-0000-0000-0000-000000000004', 3),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000003', 'conceder_perfil', '90000000-0000-0000-0000-000000000002', 1),
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000004', 'exigir_aprovacao', NULL, 1);

-- Eventos JML
INSERT INTO public.eventos_jml (id, tipo, status, colaborador_id, colaborador_nome, dados_antes, dados_depois, origem, tentativas) VALUES
  ('bb000000-0000-0000-0000-000000000001', 'joiner', 'executado', 'f0000000-0000-0000-0000-000000000006', 'Roberto Almeida', NULL, '{"cargo": "Desenvolvedor Backend", "area": "Tecnologia"}', 'importacao', 1),
  ('bb000000-0000-0000-0000-000000000002', 'mover', 'pendente', 'f0000000-0000-0000-0000-000000000002', 'Carlos Souza', '{"cargo": "Dev Junior", "area": "Tecnologia"}', '{"cargo": "Desenvolvedor Backend", "area": "Tecnologia"}', 'importacao', 0),
  ('bb000000-0000-0000-0000-000000000003', 'leaver', 'executado', 'f0000000-0000-0000-0000-000000000003', 'Maria Oliveira', '{"cargo": "Coord. Financeiro", "area": "Financeiro"}', NULL, 'importacao', 1),
  ('bb000000-0000-0000-0000-000000000004', 'joiner', 'quarentena', NULL, 'Pessoa Desconhecida', NULL, '{"cargo": "Estagiário", "area": "Marketing"}', 'importacao', 0),
  ('bb000000-0000-0000-0000-000000000005', 'mover', 'erro', 'f0000000-0000-0000-0000-000000000005', 'Lucia Ferreira', '{"cargo": "Analista Jr", "area": "Dados & BI"}', '{"cargo": "Analista de Dados", "area": "Dados & BI"}', 'importacao', 3);

-- Evento JML Acoes
INSERT INTO public.evento_jml_acoes (id, evento_id, descricao, aplicacao, status) VALUES
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000001', 'Criar conta M365', 'Microsoft 365', 'executado'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000001', 'Atribuir perfil Jira Developer', 'Jira', 'executado'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000002', 'Atualizar cargo no SAP', 'SAP ERP', 'pendente'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000003', 'Revogar todos os acessos', NULL, 'executado'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000005', 'Atualizar perfil Datadog', 'Datadog', 'erro');

-- Evento JML Aprovacoes
INSERT INTO public.evento_jml_aprovacoes (id, evento_id, etapa, aprovador, status) VALUES
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000002', 1, 'Maria Owner', 'pendente'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000003', 1, 'Maria Owner', 'aprovado'),
  (gen_random_uuid(), 'bb000000-0000-0000-0000-000000000003', 2, 'João IAM', 'aprovado');

-- Excecoes
INSERT INTO public.excecoes (id, solicitante, colaborador_nome, colaborador_id, perfil_solicitado, perfil_id, justificativa, status, aprovador, validade) VALUES
  (gen_random_uuid(), 'Pedro Costa', 'Pedro Costa', 'f0000000-0000-0000-0000-000000000004', 'AWS Admin', '90000000-0000-0000-0000-000000000004', 'Necessário para debug de produção urgente', 'pendente', NULL, '2026-04-17'),
  (gen_random_uuid(), 'Ana Silva', 'Ana Silva', 'f0000000-0000-0000-0000-000000000001', 'SAP Financeiro', '90000000-0000-0000-0000-000000000002', 'Apoio temporário ao fechamento contábil', 'aprovada', 'João IAM', '2026-03-31'),
  (gen_random_uuid(), 'Carlos Souza', 'Carlos Souza', 'f0000000-0000-0000-0000-000000000002', 'Datadog Pro', '90000000-0000-0000-0000-000000000006', 'Monitoramento de deploy crítico', 'rejeitada', 'Maria Owner', NULL);

-- Revisoes
INSERT INTO public.revisoes (id, nome, descricao, status, responsavel, data_inicio, data_fim, total_itens, itens_revisados) VALUES
  ('cc000000-0000-0000-0000-000000000001', 'Revisão Q1 2026 — Acessos Críticos', 'Certificação trimestral de perfis críticos', 'em_andamento', 'João IAM', '2026-03-01', '2026-03-31', 12, 7),
  ('cc000000-0000-0000-0000-000000000002', 'Revisão Anual 2025 — Terceiros', 'Revisão anual de acessos de terceiros', 'concluida', 'Maria Owner', '2025-12-01', '2025-12-31', 8, 8);

-- Revisao Itens
INSERT INTO public.revisao_itens (id, revisao_id, colaborador_nome, colaborador_id, perfil_nome, perfil_id, decisao, justificativa) VALUES
  (gen_random_uuid(), 'cc000000-0000-0000-0000-000000000001', 'Pedro Costa', 'f0000000-0000-0000-0000-000000000004', 'AWS Admin', '90000000-0000-0000-0000-000000000004', 'manter', 'Necessário para operações'),
  (gen_random_uuid(), 'cc000000-0000-0000-0000-000000000001', 'Carlos Souza', 'f0000000-0000-0000-0000-000000000002', 'Jira Developer', '90000000-0000-0000-0000-000000000003', 'manter', NULL),
  (gen_random_uuid(), 'cc000000-0000-0000-0000-000000000001', 'Ana Silva', 'f0000000-0000-0000-0000-000000000001', 'SAP Financeiro', '90000000-0000-0000-0000-000000000002', 'revogar', 'Exceção expirou'),
  (gen_random_uuid(), 'cc000000-0000-0000-0000-000000000001', 'Roberto Almeida', 'f0000000-0000-0000-0000-000000000006', 'AWS Admin', '90000000-0000-0000-0000-000000000004', NULL, NULL),
  (gen_random_uuid(), 'cc000000-0000-0000-0000-000000000001', 'Lucia Ferreira', 'f0000000-0000-0000-0000-000000000005', 'Datadog Pro', '90000000-0000-0000-0000-000000000006', NULL, NULL);

-- Licencas
INSERT INTO public.licencas (id, aplicacao_id, nome, tipo, total, em_uso, custo_unitario, renovacao) VALUES
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000001', 'Microsoft 365 E3', 'SaaS', 1200, 1150, 32.00, '2026-12-01'),
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000002', 'SAP ERP User', 'On-Premise', 340, 310, 150.00, '2027-01-01'),
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000003', 'Jira Cloud Standard', 'SaaS', 500, 420, 8.00, '2026-09-01'),
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000004', 'Slack Business+', 'SaaS', 800, 750, 12.50, '2026-11-01'),
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000006', 'AWS Reserved', 'IaaS', 100, 85, 500.00, '2026-06-01'),
  (gen_random_uuid(), '80000000-0000-0000-0000-000000000007', 'Datadog Pro', 'SaaS', 50, 48, 23.00, '2026-08-01');

-- Auditoria
INSERT INTO public.auditoria (id, timestamp, operador, acao, entidade, entidade_id, resumo, ip) VALUES
  (gen_random_uuid(), '2026-03-17 10:42:15-03', 'João IAM', 'Aprovar exceção', 'excecao', 'EXC-001', 'Aprovação de acesso extra ao AWS Console para Pedro Costa', '10.0.1.42'),
  (gen_random_uuid(), '2026-03-17 10:30:08-03', 'Sistema', 'Executar evento JML', 'evento_jml', 'EVT-002', 'Mover executado: Carlos Souza cargo atualizado', NULL),
  (gen_random_uuid(), '2026-03-17 09:15:00-03', 'Admin Principal', 'Importar base 2Easy', 'pessoa', 'IMP-142', 'Importação #142: 1247 registros, 1 novo, 3 alterados, 2 quarentena', '10.0.1.10'),
  (gen_random_uuid(), '2026-03-16 16:00:22-03', 'Maria Owner', 'Criar regra', 'regra', 'REG-005', 'Nova regra: Terceiro Crítico → Aprovação Owner', '10.0.2.55'),
  (gen_random_uuid(), '2026-03-16 14:30:11-03', 'Maria Owner', 'Aprovar evento JML', 'evento_jml', 'EVT-003', 'Aprovação 1/2 para leaver Maria Oliveira', '10.0.2.55'),
  (gen_random_uuid(), '2026-03-16 11:00:45-03', 'João IAM', 'Ativar regra', 'regra', 'REG-004', 'Regra Financeiro → SAP + BI ativada', '10.0.1.42'),
  (gen_random_uuid(), '2026-03-15 09:30:00-03', 'Sistema', 'Retry evento JML', 'evento_jml', 'EVT-005', 'Tentativa 2/3 para mover Lucia Ferreira — falha de integração', NULL),
  (gen_random_uuid(), '2026-03-15 09:00:00-03', 'Sistema', 'Erro evento JML', 'evento_jml', 'EVT-010', 'Erro permanente: Roberto Almeida status mover — max tentativas', NULL);

-- Alertas
INSERT INTO public.alertas (id, tipo, severidade, titulo, mensagem, ref_tipo, ref_id, ref_url, lido, data) VALUES
  (gen_random_uuid(), 'vencimento_terceiro', 'critico', 'Contrato vencendo em 3 dias', 'Marcos Vieira (SecureIT) — contrato vence em 20/03/2026', 'terceiro', '12', '/terceiros/12', false, '2026-03-17 08:00:00-03'),
  (gen_random_uuid(), 'evento_jml_erro', 'critico', 'Erro permanente em evento JML', 'Roberto Almeida — evento mover atingiu max tentativas', 'evento', '10', '/eventos-jml/10', false, '2026-03-15 09:30:00-03'),
  (gen_random_uuid(), 'quarentena', 'aviso', '2 registros em quarentena', 'Importação #142 — 2 pessoas ausentes aguardam validação', 'eventos', '', '/eventos-jml', false, '2026-03-17 10:00:00-03'),
  (gen_random_uuid(), 'licenca_critica', 'aviso', 'Licença Datadog Pro com disponibilidade crítica', '2 de 50 disponíveis (96% em uso)', 'licenca', '6', '/licencas/6', true, '2026-03-16 12:00:00-03'),
  (gen_random_uuid(), 'aprovacao_pendente', 'info', 'Aprovação pendente', 'Exceção de acesso para Pedro Costa aguarda sua decisão', 'excecao', '1', '/excecoes', true, '2026-03-16 10:00:00-03'),
  (gen_random_uuid(), 'importacao', 'info', 'Importação #142 concluída', '1247 registros processados: 1 novo, 3 alterados, 2 quarentena', 'importacao', '', '/colaboradores', true, '2026-03-17 09:15:00-03'),
  (gen_random_uuid(), 'vencimento_terceiro', 'aviso', 'Contrato vencendo em 7 dias', 'Ricardo Mendes (TechConsult) — contrato vence em 24/03/2026', 'terceiro', '10', '/terceiros/10', true, '2026-03-17 08:00:00-03');

-- Perfil atribuicoes
INSERT INTO public.perfil_atribuicoes (perfil_id, colaborador_id, origem) VALUES
  ('90000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'regra'),
  ('90000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'excecao'),
  ('90000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 'regra'),
  ('90000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000002', 'regra'),
  ('90000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 'regra'),
  ('90000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000005', 'manual');

-- Perfil composicao
INSERT INTO public.perfil_composicao (perfil_id, tipo, nome, detalhe) VALUES
  ('90000000-0000-0000-0000-000000000001', 'aplicacao', 'Microsoft 365', 'Exchange Online + Teams'),
  ('90000000-0000-0000-0000-000000000001', 'licenca', 'M365 E3', 'Licença E3 completa'),
  ('90000000-0000-0000-0000-000000000002', 'aplicacao', 'SAP ERP', 'Módulo FI + CO'),
  ('90000000-0000-0000-0000-000000000002', 'grupo', 'SAP_FINANCE_USERS', 'Grupo AD financeiro'),
  ('90000000-0000-0000-0000-000000000003', 'aplicacao', 'Jira', 'Projeto DEV'),
  ('90000000-0000-0000-0000-000000000004', 'aplicacao', 'AWS Console', 'Conta produção'),
  ('90000000-0000-0000-0000-000000000004', 'grupo', 'AWS_ADMINS', 'IAM Admin group'),
  ('90000000-0000-0000-0000-000000000005', 'aplicacao', 'Slack', 'Workspace principal'),
  ('90000000-0000-0000-0000-000000000006', 'aplicacao', 'Datadog', 'APM + Logs'),
  ('90000000-0000-0000-0000-000000000006', 'licenca', 'Datadog Pro', 'Licença Pro');
