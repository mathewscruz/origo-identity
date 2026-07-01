## Problema

Max Henrique Pereira De Souza aparece na fila como "Desabilitar no AD" mesmo já estando **desabilitado no AD**. Não é caso isolado — a mesma lógica gera esse ruído para todo colaborador desligado no CSV cuja conta já está desabilitada.

## Causa raiz

Em `supabase/functions/reconcile-identities/index.ts`, o bloco `disable_entra` (linha 326-338) verifica corretamente se o Entra já reporta `accountEnabled=false` e pula (`skipped_already_disabled`). Já o bloco `disable` do AD (linha 340-354, corrigido na rodada anterior) **não faz essa verificação** — ele só olha `onPremisesSyncEnabled`. Como o AD Connect sincroniza o `accountEnabled` do AD para o Entra, o Entra é uma fonte confiável para saber que a conta AD já está desabilitada; só que o código nunca lê esse campo antes de enfileirar o `disable`.

Resultado: para toda conta híbrida já desabilitada, o reconcile cria um `disable` AD duplicado que fica em `waiting_approval` para sempre.

## O que vou fazer

### 1. Corrigir o reconcile

Em `supabase/functions/reconcile-identities/index.ts`, no bloco AD (linha ~347):

- Adicionar guard `entraMatch.accountEnabled === true` antes de enfileirar `disable`.
- Se `onPremisesSyncEnabled=true` mas `accountEnabled=false`, incrementar novo contador `stats.skipped_ad_already_disabled` e não enfileirar nada.

Trecho final da decisão AD ficará:

```
const isOnPrem = entraMatch?.onPremisesSyncEnabled === true;
if (c.sam_account_name && isOnPrem && entraMatch.accountEnabled &&
    !openByColab.has(`${c.id}|disable`)) {
  … enqueue disable …
} else if (c.sam_account_name && isOnPrem && !entraMatch.accountEnabled) {
  stats.skipped_ad_already_disabled++;
} else if (c.sam_account_name && !entraMatch) {
  stats.skipped_ad_unknown++;
}
```

### 2. Limpar os itens existentes

Não temos `accountEnabled` armazenado no banco, então não dá para filtrar "já desabilitado" via SQL. Estratégia mais segura: **cancelar em bloco os 3.441 `disable` abertos gerados por `requested_by='reconciliacao'`** e pedir para você rodar a reconciliação de novo. O reconcile corrigido vai reenfileirar apenas os disables realmente necessários (contas híbridas ainda `accountEnabled=true`).

- **Alvo**: `iam_queue` onde `action_type='disable'`, `status IN ('pending','waiting_approval')`, `requested_by='reconciliacao'`.
- **Ação**: marcar como `cancelled` com `result_message='Cancelado pelo QA para reavaliação: reconcile-identities corrigido para pular contas já desabilitadas no AD; reprocessado na próxima execução do ciclo diário.'`
- **Preservado**: itens de outras origens (JML manual, workflow, etc.).

### 3. Validar

Depois de rodar `reconcile-identities` novamente via UI:

- Query: contar `disable` abertos e comparar com o total anterior — deve cair significativamente (só contas ainda `accountEnabled=true` no Entra).
- Conferir o caso do Max especificamente: não deve ter novo `disable` criado.
- Ler o `sync_jobs` da reconciliação: `skipped_ad_already_disabled` e `skipped_ad_unknown` devem estar populados.

## Fora de escopo

- Adicionar coluna `entra_account_enabled` em `colaboradores` para permitir filtro SQL em cleanups futuros.
- Verificação equivalente para AD-only puro (impossível sem consultar `iam-agent-api` no reconcile — mudança maior).

## Detalhes técnicos

- Arquivo: `supabase/functions/reconcile-identities/index.ts` (bloco AD + init de stats).
- Sem migration.
- Data change via `supabase--insert` (UPDATE não destrutivo — só muda status para `cancelled`, tudo auditável).
