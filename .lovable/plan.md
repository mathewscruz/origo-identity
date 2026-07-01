## Problema

O caso do Elpidio Magno Da Costa Neto (que aparece no "Aprovação IAM" como **Desabilitar no AD** mesmo sem existir em AD nem em Entra) **não é isolado**. Rodando a query de auditoria: **2.034 itens de `disable` (AD) abertos na fila estão apontando para colaboradores que nem sequer têm `entra_id` vinculado** — ou seja, o sistema está pedindo para desabilitar contas que muito provavelmente também não existem no AD.

## Causa raiz

Em `supabase/functions/reconcile-identities/index.ts` (linha 341), a decisão de enfileirar `disable` no AD é:

```
const isOnPrem = entraMatch?.onPremisesSyncEnabled === true || !entraMatch;
if (c.sam_account_name && isOnPrem && …) enqueue "disable"
```

O `|| !entraMatch` é o problema: sempre que o colaborador **não é encontrado no Entra**, o código presume que ele "só existe no AD on-prem" e enfileira o `disable`. Como o `sam_account_name` é derivado do e-mail no `sync-csv-colab` (não do AD), ele existe para praticamente todo mundo — inclusive para colaboradores que nunca tiveram conta nem no Entra nem no AD (terceiros antigos, cadastros manuais, imports históricos, duplicatas). Resultado: fila cheia de disables fantasmas aguardando aprovação.

O bloco `disable_entra` (linha 326) já está correto — só enfileira se houver `entraMatch`. É o bloco AD que precisa da mesma proteção.

## O que vou fazer

### 1. Corrigir a lógica do reconcile

Em `supabase/functions/reconcile-identities/index.ts`:

- Trocar `const isOnPrem = entraMatch?.onPremisesSyncEnabled === true || !entraMatch;` por `const isOnPrem = entraMatch?.onPremisesSyncEnabled === true;`
- Adicionar contador `stats.skipped_ad_unknown` para os casos em que não há evidência positiva de conta AD (útil no report do job).
- Comentar a decisão explicando: só enfileiramos `disable` no AD quando o Entra confirma que a conta é sincronizada on-prem (única fonte confiável de existência no AD, já que o CSV só nos dá o `sam` derivado). Colaborador desligado sem match no Entra é apenas registrado como leaver — sem ação de provisionamento.

Trade-off consciente: um usuário exclusivamente on-prem (sem Entra) não seria pego. Na prática, o ambiente da Órigo é híbrido AD Connect → Entra, então todo usuário AD real aparece no Entra. Se surgir exceção real, ela pode ser tratada manualmente via botão "Desabilitar AD" no detalhe do colaborador.

### 2. Limpar a fila atual (dados)

Cancelar os itens `disable` abertos que se enquadram no bug, para você não precisar aprovar 2.034 fantasmas:

- **Alvo**: `iam_queue` onde `action_type='disable'`, `status IN ('pending','waiting_approval')`, `requested_by='reconciliacao'` **e** o colaborador vinculado tem `entra_id IS NULL`.
- **Ação**: marcar como `cancelled` com `result_message='Cancelado pelo QA: colaborador sem vínculo no Entra ID; existência no AD não pôde ser confirmada (bug do reconcile-identities corrigido em 01/07/2026).'`
- **Preservado**: itens `disable_entra`, itens onde o colab tem `entra_id` (esses são reais on-prem sync), itens de outras origens (`requested_by <> 'reconciliacao'`) e itens já em status final.

### 3. Validar

- Rodar de novo o `reconcile-identities` (via UI ou aguardar sua ação) e confirmar via query que nenhum novo `disable` fantasma é criado.
- Query de verificação: contar `disable` abertos com `entra_id IS NULL` deve cair para ~0 (só sobrariam casos gerados por outras origens que não o reconcile).

## Fora de escopo desta rodada

- Detectar contas AD-only reais (exigiria consulta ativa ao `iam-agent-api` durante o reconcile — mudança maior).
- Deduplicar os 2 registros do Elpidio (matrícula/e-mail iguais) — parte do backlog A-1/A-2 já reportado.
- Alterar o comportamento do `sync-csv-colab` que gera `sam_account_name` sem checar AD.

## Detalhes técnicos

- Arquivo tocado: `supabase/functions/reconcile-identities/index.ts` (uma linha alterada + contador novo + comentário).
- Migration: nenhuma (só edge function + UPDATE de dados).
- UPDATE de dados via `supabase--insert` — não é destrutivo (só muda status para `cancelled`, itens ficam auditáveis).
