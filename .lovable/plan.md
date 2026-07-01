## Diagnóstico

**Causa raiz do "Desabilitar Entra ID" fantasma:**
Em `supabase/functions/reconcile-identities/index.ts` (linhas 253-272), a etapa que gera `disable` + `disable_entra` para desligados filtra apenas por `sam_account_name` presente. Nunca consulta o Graph para saber se aquele usuário existe no Entra ID. Resultado: 1868 itens enfileirados, muitos apontando para contas inexistentes.

**Casos análogos verificados:**
- `disable_entra`/`enable_entra` em `preLeaver.ts`, `colaboradorLifecycle.ts`, `terceiroLifecycle.ts` e `sync-csv-colab/index.ts`: enfileiram sem checar Graph. Menos crítico porque geralmente rodam sobre colabs já linkados, mas ainda pode gerar falha ao processar.
- `create_if_not_exists`: **OK** — já tem pré-check contra Entra em `sync-csv-colab` (linha 164) e no reconcile mode do `process-iam-queue`.
- Divergência CSV × Entra em `process-iam-queue` (linhas 1151-1186): **OK** — já usa index do Entra.

## Plano — SharePoint como source of truth com guard-rails no Entra

### 1) `reconcile-identities/index.ts` — cross-check obrigatório contra Entra

- Baixar index do Entra ID (id + userPrincipalName + mail + accountEnabled + onPremisesSyncEnabled) via `$select` no `/users` paginado, uma vez no início da execução, e reportar fase `baixando_entra` no `sync_jobs`.
- Construir map por `entra_id`, `upn.toLowerCase()`, `mail.toLowerCase()` para lookup O(1).
- Ao processar desligados sem leaver:
  - Resolver o usuário no Entra por `colab.entra_id` → fallback `colab.email`.
  - **Não achou** → registrar em `stats.skipped_no_entra[]`, marcar leaver como `executado` com mensagem "Reconciliado: não existe no Entra ID", **não** enfileirar `disable_entra`. Enfileirar `disable` (AD) só se `sam_account_name` presente E colab tem histórico AD (`entra.onPremisesSyncEnabled === true` OU nenhum vínculo Entra encontrado — assume conta on-prem).
  - **Achou mas `accountEnabled === false`** → skip disable_entra (`stats.skipped_already_disabled++`), marcar leaver como executado.
  - **Achou e enabled** → enfileira `disable_entra` (correto).
- Novos contadores nos stats: `skipped_no_entra`, `skipped_already_disabled`, `disable_entra_enqueued`, `disable_ad_enqueued`.

### 2) `process-iam-queue/index.ts` — guard-rail no handler

- Para `disable_entra`, `enable_entra`, `update_entra`:
  - Antes do PATCH, fazer `GET /users/{userId}` no Graph.
  - **404** → marcar item como `cancelled` (não `failed`) com motivo "Usuário não existe mais no Entra ID". Registrar em auditoria.
  - Estado atual já é o desejado (`accountEnabled` bate com a ação) → `success` como no-op com mensagem "Estado já correto".
  - Só executar PATCH quando faz sentido.

### 3) Limpeza dos itens fantasmas atuais

Migração/insert que cancela em massa (`status='cancelled'`, motivo em `execution_result`) os itens gerados pela reconciliação buggada:

```sql
UPDATE iam_queue
   SET status = 'cancelled',
       execution_result = jsonb_build_object(
         'reason', 'Cancelado: gerado por reconciliação sem cross-check contra Entra ID; rode a reconciliação novamente.'
       ),
       updated_at = now()
 WHERE requested_by = 'reconciliacao'
   AND action_type IN ('disable', 'disable_entra')
   AND status IN ('pending', 'waiting_approval');
```

Após rodar a nova reconciliação corrigida, os itens legítimos são re-enfileirados automaticamente.

### 4) Frontend — visibilidade no card de Reconciliação

`src/pages/configuracoes/IntegracoesPage.tsx`:
- Ler novos contadores do último `sync_jobs` de `reconcile_identities` (via `message`/`detalhes` na auditoria) e mostrar breakdown: "X desabilitações no Entra · Y no AD · Z pulados (não existem no Entra) · W já estavam disabled".
- Toast final de "Rodar ciclo diário" também exibe esses números.

### 5) Validação geral (fora dos handlers acima)

- Confirmar via `read_query` que após rerun: `iam_queue` só terá `disable_entra` com `colaborador.entra_id NOT NULL` e não terá `disable_entra` para colabs `ativo`.
- Sanidade nos outros enqueuers (`preLeaver`, `colaboradorLifecycle`, `terceiroLifecycle`, `sync-csv-colab`): **sem mudança de código** porque o novo guard-rail no worker (item 2) já cobre o caso "não existe no Entra" sem exigir refatoração em cada call site.

### Ordem de execução

1. Backend `reconcile-identities` (cross-check).
2. Backend `process-iam-queue` (guard-rail 404 e no-op).
3. Migração/insert de limpeza dos fantasmas.
4. Frontend `IntegracoesPage` (breakdown).
5. Rerun manual do "Rodar ciclo diário" para validar.

### Fora de escopo

- Reescrever `enqueue.ts` para pré-checar Entra em cada ponto de origem (o guard-rail no worker resolve sem custo extra em cada call site).
- Mexer em regras de status ou lifecycle dos colabs.
