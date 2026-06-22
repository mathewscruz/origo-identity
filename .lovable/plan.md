## Visão geral

Três frentes complementares: **(A) unificar o fluxo JML** em uma única jornada operacional; **(B) reconstruir o portal self-service** como catálogo navegável; **(C) refatorações estruturais** que destravam as duas anteriores.

Cada frente é entregável de forma independente — implementamos em ordem, com release no fim de cada uma.

---

## A. Fluxo JML unificado

Hoje cada evento de ciclo de vida exige percorrer 3-4 telas (Colaborador → Eventos JML → Fila → Auditoria) e a tela de Eventos JML virou um redirect para a Fila, perdendo a noção de "evento". Vamos consolidar.

### A.1 Nova rota `/eventos-jml` como timeline operacional
- Lista cronológica de Joiners/Movers/Leavers com filtros (tipo, status, empresa, período, com pendência humana).
- Cada linha mostra: identidade, tipo, gatilho (CSV/manual/regra), progresso (ex.: `4/7 ações executadas`), pendências (aprovação, exceção, item travado), SLA.
- Substitui o redirect atual (`/eventos-jml → /fila-provisionamento`).

### A.2 `EventoJMLDetalhePage` como painel ponta-a-ponta
Hoje tem 163 linhas e mostra pouco. Vamos torná-lo o "boletim" do evento, com seções:
1. **Identidade e snapshot** — antes/depois (já existe em `dados_antes/dados_depois`).
2. **Aprovações** — etapas do workflow, quem decidiu, quando.
3. **Ações de provisionamento** — uma tabela por sistema-alvo (AD, Entra, apps, grupos, licenças, SharePoint) com status, última tentativa, erro, botão "Reprocessar" individual e em lote.
4. **Exceções vinculadas** — quando o evento dispara um Keep-Active ou Pré-Leaver.
5. **Linha do tempo** — auditoria filtrada pelo `entidade_id = evento.id`.
6. **Ações** — "Reexecutar evento", "Cancelar e reverter", "Criar exceção", "Forçar conclusão".

### A.3 Disparo unificado a partir das páginas de identidade
Em `ColaboradorDetalhePage` e `TerceiroDetalhePage`, substituir os botões soltos ("Desativar", "Reativar", "Reprovisionar", "Pré-desligamento") por um único menu **"Iniciar evento JML"** que abre um diálogo com tipo (Joiner/Mover/Leaver/Pré-Leaver/Reativação), justificativa e preview do que será executado. O diálogo cria o `eventos_jml` + ações + entradas na fila em uma transação (via Edge Function `start-jml-event`).

### A.4 Ações JML em lote
Na nova `/eventos-jml`, permitir selecionar várias linhas e aplicar "Reprocessar pendentes" ou "Cancelar" em massa — útil quando um conector volta após falha.

### A.5 Memória
Atualizar `mem://features/jml-lifecycle-unification` documentando esse novo modelo (a entrada atual diz que JML foi unificado na Fila — vamos corrigir).

---

## B. Catálogo de acesso self-service

Hoje `PortalSolicitacoesPage` (561 linhas) é um diálogo gigante com três checklists planos (apps, grupos, licenças). Reconstruir como catálogo navegável.

### B.1 Nova UX em duas colunas
- **Esquerda — "Meus acessos"**: tudo que o usuário já tem (perfis + recursos individuais), agrupado por sistema, com botão "Solicitar revogação" por item.
- **Direita — "Catálogo"**: busca global + filtros por tipo (Aplicação, Grupo, Licença, Perfil completo), por sistema (Entra/AD/SharePoint), por área/cargo recomendado. Cada card mostra dono, descrição, conflitos de SoD conhecidos, tempo médio de aprovação.
- "Adicionar ao carrinho" → resumo no rodapé → "Solicitar" abre o diálogo de justificativa **uma vez** para o lote.

### B.2 Recomendações
- Bloco "Recomendado para você": perfis do seu cargo que você ainda não tem (usa `cargo_perfis` × `perfil_atribuicoes`).
- Bloco "Colegas da sua área têm": top recursos atribuídos a quem compartilha `area_id`.

### B.3 Status pós-pedido
Card por solicitação aberta com timeline de aprovação (etapa atual, aprovador, tempo decorrido), e botão "Cancelar item" enquanto pendente — alavanca o `solicitacao_itens` que já existe.

### B.4 Conflitos de SoD na hora do pedido
Antes de submeter, rodar `sod_conflitos` × itens selecionados e mostrar aviso bloqueante (admin pode aprovar com exceção; usuário comum não consegue submeter).

### B.5 Atalho do gestor
Mesma UX, mas com seletor "Solicitando para" listando subordinados (via `gestor_id`). Cria a solicitação no nome do colaborador, mantendo `solicitante = gestor.email`.

---

## C. Refatorações estruturais

### C.1 Quebrar páginas gigantes
- `ColaboradorDetalhePage` (955 l.) e `TerceiroDetalhePage` (544 l.) → extrair tabs em arquivos próprios sob `src/pages/colaboradores/sections/` (`IdentidadeTab`, `PerfisTab`, `RecursosIndividuaisTab`, `HistoricoTab`, `JMLTab`).
- `SolicitacoesPage` (779 l.) e `PortalSolicitacoesPage` (561 l.) → divididos junto com a frente B.

### C.2 Camada de mutações com React Query
Hoje há ~20 `supabase.from(...).update/insert/delete` espalhados em `onClick`. Criar `src/hooks/mutations/` com:
- `useStartJmlEvent`, `useReprocessQueueItem`, `useApproveSolicitacao`, `useAssignPerfil`, `useRevokePerfil`, `useToggleColabAtivo`, etc.

Cada hook centraliza: validação, toast, `invalidateQueries`, log de auditoria. Reduz duplicação e elimina o "esqueci de invalidar".

### C.3 Tipos fortes nos payloads da fila
`iam_queue.payload_json` hoje é `any` em todo lugar. Criar `src/types/iamQueue.ts` com `discriminated union` por `action_type` (`assign_group | remove_app | create | disable | ...`). Aplicar em `process-iam-queue`, `entraQueueHelper.ts`, `colaboradorLifecycle.ts`, `provisionCargoAcessos.ts`. Pega bugs como o payload errado de license/group em compile time.

### C.4 Consolidar lógica de provisionamento
`colaboradorLifecycle.ts` (386 l.), `entraQueueHelper.ts` (338 l.) e `provisionCargoAcessos.ts` (135 l.) compartilham primitivas (resolver recursos de um perfil, comparar deltas, enfileirar). Extrair `src/lib/iam/` com módulos puros:
- `resolveProfileResources(perfilId)` — devolve `{ apps, groups, licenses, sharepoint }`.
- `diffResources(before, after)` — calcula adds/removes.
- `enqueue(actions[])` — fila com idempotência por `payload_hash`.
Os arquivos atuais viram orquestradores finos.

### C.5 Hook único para "recursos efetivos" da identidade
`ColaboradorDetalhePage` recalcula recursos via 4 queries + merge manual. Extrair `useEffectiveAccess(identityId, kind)` que devolve `{ direct, viaProfile, viaRule, conflicts }`. Reaproveitado em Terceiros, Portal e Revisões.

### C.6 Padronizar Edge Functions
- Mover `corsHeaders` para `_shared/cors.ts` (hoje duplicado em ~10 functions).
- Padronizar resposta de erro: `{ error: string, code?: string, details?: any }` com helper `_shared/respond.ts`.
- Adicionar validação de input com Zod nas funções que aceitam body do front (`start-jml-event`, `process-iam-queue`, `execute-rules`).

---

## Ordem e entregas

1. **C.1 + C.2 + C.6** (base técnica, 1 release) — sem mudança visível, destrava o resto.
2. **A. Fluxo JML** (1 release) — lista timeline + detalhe ponta-a-ponta + disparo unificado.
3. **B. Catálogo self-service** (1 release) — portal redesenhado com carrinho, SoD e recomendações.
4. **C.3 + C.4 + C.5** (1 release, em paralelo a B) — tipagem da fila e consolidação dos helpers.

## Fora de escopo (deliberadamente)
- Novos conectores externos (a frente B só usa o que já está sincronizado).
- Mudança no modelo de papéis (admin/operador/viewer permanece).
- Migração para outro backend.

Posso começar pela base (passo 1) assim que você aprovar; ou, se preferir entregar valor visível primeiro, começo direto pela frente A.
