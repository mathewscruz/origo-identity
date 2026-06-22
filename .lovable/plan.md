
## Diagnóstico dos 3 módulos

### 1. Perfis de Acesso — ✅ funcional
- CRUD completo (apps, licenças, grupos, SharePoint, cargos), diff Entra na edição, cleanup ao excluir, contadores, busca, paginação.
- **Pequeno débito:** `handleDelete` ainda limpa `cargo_perfis` (resquício da Matriz removida). Sem impacto, apenas cosmético — manter por segurança.
- **Nada a alterar.**

### 2. Exceções — ⚠️ funcional mas com 3 gaps lógicos
- O que funciona: criação dos tipos `acesso` e `manter_ativo`, notificação a admins, aprovação cria `perfil_atribuicoes` + fila Entra, `manter_ativo` é honrado no `colaboradorLifecycle` e `terceiroLifecycle`, e-mail ao solicitante.

**Gaps a corrigir:**

1. **Não usa o Workflow Engine novo** — aprovação é "qualquer admin com acesso à tela". Deveria invocar `startWorkflow(escopo: "excecao", ctx)` para permitir fluxos multi-etapa (ex.: Gestor → Security). Hoje o engine só é chamado em Solicitações.
2. **Exceção tipo `acesso` não expira** — se aprovada com `validade`, o perfil fica atribuído para sempre. Deveria existir mecanismo que revoga `perfil_atribuicoes` (+ fila Entra) quando `validade < hoje`.
3. **Duplicidade silenciosa** — ao aprovar, não verifica se já existe `perfil_atribuicoes` ativa (colab + perfil). Cria duplicata.

### 3. Revisões — ⚠️ funcional mas com 4 gaps de UX/lógica
- O que funciona: criação por aplicação, geração de `revisao_itens` (colab + terceiros), token externo com RPCs SECURITY DEFINER, portal externo com bulk-actions e confirmação, edge function `save-external-review` revoga `perfil_atribuicoes` e enfileira `remove_group/license/app` no Entra.

**Gaps a corrigir:**

1. **Sem ações na campanha interna** — gestor da TI não consegue **concluir manualmente**, **cancelar** nem **reenviar o e-mail** ao owner pelo `/revisoes/:id`.
2. **Revogação ignora terceiros** — `save-external-review` só consulta `colaboradores`. Itens vindos de terceiros têm `colaborador_id` nulo e a revogação silenciosamente não enfileira nada no Entra (apenas marca a decisão). Falha funcional.
3. **Sem audit log** das decisões externas (apenas e-mail). Adicionar `auditoria` com `acao=decisao_revisao_externa`.
4. **Status `cancelada` existe no UI mas nunca é gravado** — sem ação para cancelar.

---

## Plano de implementação

### A. Exceções
- `src/pages/excecoes/ExcecoesPage.tsx`
  - Em `handleCreate` (tipo `acesso` ou `manter_ativo`): após gravar a exceção, chamar `startWorkflow({ escopo: "excecao", ctx: { colaboradorId, perfilId } })`; se nenhum fluxo bater, manter fallback atual (admins).
  - Em `handleDecision` (aprovação tipo `acesso`): antes de inserir `perfil_atribuicoes`, fazer `select` por `(colaborador_id, perfil_id, ativo=true)` e pular insert se já existir; em qualquer caso, gravar `origem=excecao` + `excecao_id` (já existe coluna?).
- **Expiração automática de exceções `acesso`:**
  - Nova Edge Function `expire-access-exceptions` (manual, conforme política "sem cron"): varre `excecoes` com `tipo_excecao=acesso`, `status=aprovada`, `validade < hoje`, e para cada uma:
    - marca `status=expirada`,
    - desativa `perfil_atribuicoes` correspondente (`origem=excecao`),
    - enfileira `remove_group/license/app` do perfil para o colaborador,
    - loga auditoria.
  - Botão "Expirar exceções vencidas" na aba **Aprovadas/Expiradas** da própria página, chamando essa função.

### B. Revisões
- `src/pages/revisoes/RevisaoDetalhePage.tsx`: adicionar barra de ações para campanhas `em_andamento`:
  - **Reenviar e-mail** → `supabase.functions.invoke("send-review-email")`.
  - **Concluir agora** → marca `status=concluida`, processa decisões já gravadas (chamando `save-external-review` internamente, ou nova função `finalize-review`).
  - **Cancelar campanha** → AlertDialog → `status=cancelada` + audit.
- `supabase/functions/save-external-review/index.ts`:
  - Quando `colaborador_id` for nulo, buscar em `terceiros` por `revisao_itens.terceiro_id` (já existe na seleção em RevisoesPage) e enfileirar `remove_*` usando email/sam do terceiro.
  - Após o loop, inserir em `auditoria` com resumo `Revisão externa concluída: X mantidos, Y revogados (token …)`.
- `revisao_itens`: garantir coluna `terceiro_id` (já consultada em `RevisoesPage`); se faltar no schema, migração para adicioná-la.

### C. Itens fora de escopo
- Não mexer em Perfis de Acesso.
- Não criar cron — expiração de exceções e finalização de revisão são acionadas manualmente, conforme memória `sync-policy`.
- Workflow `escopo=jml` permanece para depois.

### Detalhes técnicos
- Migrações necessárias:
  - `ALTER TABLE excecoes ADD COLUMN IF NOT EXISTS excecao_id` — já não, mas adicionar `perfil_atribuicoes.excecao_id uuid` para permitir a expiração revogar a atribuição certa.
  - `ALTER TABLE revisao_itens ADD COLUMN IF NOT EXISTS terceiro_id uuid` se ausente (verificar schema atual antes).
- Edge Functions novas: `expire-access-exceptions`, `finalize-review` — com CORS padrão e service_role.
- UI: AlertDialog para Cancelar Campanha (memory rule de confirmações destrutivas).

Quer que eu prossiga com tudo, ou prefere fasear (ex.: primeiro Revisões, depois Exceções)?
