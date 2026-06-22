## Parte 1 — Remover a Matriz

- `src/components/AppSidebar.tsx`: remover item `{ title: "Matriz", url: "/matriz" }`.
- `src/App.tsx`: remover `import MatrizPage` e a `<Route path="/matriz">`.
- `rm src/pages/matriz/MatrizPage.tsx`.
- Não há tabela dedicada — sem migration.

## Parte 2 — Workflow funcional (MVP)

### Diagnóstico

O workflow atual é cosmético: o cadastro nunca é lido pelo motor de aprovação. Solicitações usam um caminho paralelo hardcoded por `owner_email`. Vou unificar tudo num motor real que suporta múltiplas etapas, múltiplos aprovadores por etapa e disparo automático de provisionamento ao final.

### Modelo de dados novo

**Migration**:

```sql
-- Fluxo é o "template" de aprovação para um escopo
CREATE TABLE public.workflow_fluxos (
  id uuid PK,
  nome text NOT NULL,
  escopo text NOT NULL CHECK (escopo IN ('solicitacao','excecao','jml')),
  is_default boolean DEFAULT false,
  -- Filtros opcionais; primeiro fluxo cujos filtros batem é escolhido
  filtro_aplicacao_ids uuid[] DEFAULT '{}',
  filtro_perfil_ids uuid[] DEFAULT '{}',
  filtro_licenca_ids uuid[] DEFAULT '{}',
  prioridade int DEFAULT 100,           -- menor = mais prioritário
  ativo boolean DEFAULT true,
  created_at, updated_at
);

-- Etapas em ordem dentro do fluxo
CREATE TABLE public.workflow_etapas (   -- ALTERAR a existente
  id uuid PK,
  fluxo_id uuid REFERENCES workflow_fluxos(id) ON DELETE CASCADE,
  ordem int NOT NULL,
  nome text NOT NULL,                   -- ex.: "Aprovação do Gestor"
  tipo_aprovador text NOT NULL          -- gestor_direto | owner_recurso | usuario_especifico | papel
    CHECK (tipo_aprovador IN ('gestor_direto','owner_recurso','usuario_especifico','papel')),
  papel app_role NULL,                  -- quando tipo=papel
  modo_aprovacao text NOT NULL          -- qualquer_um | todos
    CHECK (modo_aprovacao IN ('qualquer_um','todos')),
  timeout_horas int DEFAULT 48,
  acao_timeout text DEFAULT 'escalar_proxima' -- escalar_proxima | auto_aprovar | auto_rejeitar
    CHECK (acao_timeout IN ('escalar_proxima','auto_aprovar','auto_rejeitar')),
  ativo boolean DEFAULT true,
  created_at
);

-- Aprovadores nominais (quando tipo=usuario_especifico)
CREATE TABLE public.workflow_etapa_aprovadores (
  id uuid PK,
  etapa_id uuid REFERENCES workflow_etapas(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text
);

-- Execução: 1 row por solicitação alimentada pelo motor
ALTER TABLE public.solicitacoes_acesso
  ADD COLUMN fluxo_id uuid REFERENCES workflow_fluxos(id),
  ADD COLUMN etapa_atual_ordem int;

-- workflow_execucoes vira o LOG: 1 row por decisão individual
ALTER TABLE public.workflow_execucoes
  ADD COLUMN solicitacao_id uuid REFERENCES solicitacoes_acesso(id) ON DELETE CASCADE,
  ADD COLUMN ordem int,
  ADD COLUMN aprovador_email text;
-- (mantém entidade_tipo, etapa_id, status, comentario, data_decisao)
```

Migração da configuração atual: `workflow_etapas` existentes serão movidas para um fluxo "Padrão (legado)" por escopo, mapeando `aprovador_tipo gestor→gestor_direto, owner→owner_recurso, ti→papel(admin)`, `modo_aprovacao=qualquer_um`.

### Motor (`src/lib/workflow/engine.ts`)

API pequena, client-side (chama Supabase com RLS — sem edge function nova nesta entrega):

```ts
selectFluxo(escopo, contexto): Promise<Fluxo>     // resolve filtros, fallback no default
startWorkflow(escopo, solicitacaoId, contexto)    // cria instância: define fluxo_id, etapa_atual_ordem=1, notifica aprovadores
resolveAprovadores(etapa, contexto): string[]     // expande gestor/owner/papel/usuário → emails
recordDecision(solicitacaoId, etapaOrdem, decisao, comentario)
                                                  // grava row em workflow_execucoes, avalia modo (qualquer_um/todos)
                                                  // avança ou finaliza; finaliza dispara provisionItem() existente + triggerEntraProcessing()
listMinhasPendencias(emailUsuario): SolicitacaoPendente[]  // para a tela de "Minhas Aprovações"
```

`contexto` inclui colaborador, itens (apps/grupos/licenças com seus owners), perfil_id alvo etc. — derivado do payload da solicitação.

### Integração nos pontos existentes

- `src/pages/solicitacoes/SolicitacoesPage.tsx` (`handleSubmit`) e `src/pages/portal/PortalSolicitacoesPage.tsx` (criar):
  - Em vez do bloco hardcoded (`owner_email` → status pendente/aprovado e auto-provisão), chamar `startWorkflow('solicitacao', id, contexto)`.
  - Se o fluxo escolhido não tem etapas (ou nenhuma se aplica), auto-aprova (comportamento atual).
- `DecisaoDialog` + `handleDecision`:
  - Em vez de mexer em `solicitacao_itens.status`, chamar `recordDecision(solicitacaoId, etapaAtual, decisao, comentario)`.
  - Os `solicitacao_itens` continuam existindo (granularidade por recurso é mantida em paralelo aos itens já existentes), mas a decisão por **solicitação inteira** passa a respeitar o fluxo. Decisão por item individual continua disponível, mas só no fluxo "padrão" com etapa única do tipo `owner_recurso` — que é exatamente o comportamento atual.

### UI nova de `WorkflowPage`

Reescrita em 3 áreas:

1. **Lista de fluxos** (cards): nome, escopo, filtros resumidos, nº de etapas, badge ativo/inativo, default star, ações editar/duplicar/excluir.
2. **Editor de fluxo** (dialog grande):
   - Cabeçalho: nome, escopo, default, filtros (multi-select de apps/perfis/licenças).
   - Lista ordenável de etapas (drag handle visual + setas up/down).
   - Para cada etapa: nome, tipo de aprovador (select), seletor adicional dependendo do tipo (papel | lista de e-mails | nada), modo (qualquer_um/todos), timeout e ação no timeout.
3. **Execuções recentes** (mantém aba): tabela com solicitação, etapa, aprovador resolvido, decisão, data — agora populada de verdade.

Sidebar continua com o item "Workflow" apontando para `/workflow`.

### Edge cases tratados

- Solicitação sem fluxo aplicável → auto-aprovação (compat).
- Aprovador da etapa é o próprio solicitante → pula a etapa (audit log) para evitar self-approval.
- Aprovador resolvido fora do sistema (e-mail sem `profiles`) → permitido se `tipo_aprovador=usuario_especifico` e está na lista; a tela "Minhas Pendências" exige login, então convites externos por e-mail ficam para fora de escopo (link de aprovação por token é evolução).
- Etapa `modo=todos` com lista vazia após resolução → escala automaticamente conforme `acao_timeout` na criação.

### Disparo de provisionamento

A função `provisionItem()` que já existe em `SolicitacoesPage` será extraída para `src/lib/workflow/provisioning.ts` e reutilizada pelo motor ao finalizar com `aprovada`. Mantém o mesmo contrato com `iam_queue` (camelCase) e chama `triggerEntraProcessing()` ao final.

### Fora do escopo desta entrega

- Motor para `excecao` e `jml` — cadastro suportado, execução automática só na próxima frente.
- Token externo de aprovação por e-mail (igual ao das revisões).
- Quórum por peso/percentual.
- Histórico visual em timeline na tela da solicitação (já temos `RequestApprovalCard`, será adaptado num próximo passo).

### Itens de remoção controlada

- Coluna `workflow_etapas.aprovador_tipo` antiga será descartada **após** a migração de dados.
- Tela atual do `WorkflowPage` é integralmente reescrita; não há quebra de URL.

Confirma para eu implementar tudo isso em sequência?
