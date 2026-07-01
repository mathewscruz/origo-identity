## Contexto pós-reconciliação

Resumo da reconciliação de 18:01:
- **171 disable_entra** enfileirados (cross-checked contra Entra ID e enabled)
- **3189 disable AD** enfileirados (on-prem ou sem match Entra)
- **1974 pulados** (desligados que não existem no Entra Cloud)
- **1061 já desabilitados** (skip, no-op)
- **0 create_if_not_exists** / **0 review_orphan_entra** pendentes

Estado do banco: 604 ativos (27 sem entra_id · email presente), 3288 desligados (1191 linkados).

## Diagnóstico de cobertura

**O que a reconciliação atual COBRE (com cross-check contra Entra):**
- Desligado + existe no Entra + enabled → `disable_entra` ✓
- Desligado + on-prem/sem match Entra → `disable` AD ✓

**O que a reconciliação atual NÃO cobre (lacunas para 100% assertividade CSV × Entra × AD):**
1. **Ativo no CSV sem conta no Entra ID** → deveria gerar `create_if_not_exists`. Hoje só o `sync-csv-colab` faz isso na hora do import; se o colab já existia com `entra_id NULL` e não passou por sync, fica ignorado. Temos 27 casos assim agora.
2. **Ativo no CSV com conta disabled no Entra** (voltou/reativou) → deveria gerar `enable_entra`. Reconcile não gera.
3. **Conta no Entra sem match no CSV** (órfã) → deveria gerar `review_orphan_entra`. Reconcile não gera.
4. **Divergência de atributos** (department, jobTitle, companyName) → `update_entra`. Reconcile não gera.

## Plano — validação e completude

### Fase 1: Auditoria de amostragem contra Graph (READ-ONLY)

Nova edge function `audit-reconciliation` que gera relatório em `auditoria`:
- Pega até 50 itens aleatórios de cada bucket da última reconciliação:
  - `disable_entra` enfileirados → confirma via Graph que a conta existe E está `accountEnabled=true`.
  - `disable` AD enfileirados → confirma via Graph que a conta é `onPremisesSyncEnabled=true` OU não existe no Entra.
  - Colabs "pulados no Entra" (via re-fetch por email) → confirma que Graph retorna 0 resultados.
- Retorna 3 números: `entra_correct/entra_wrong`, `ad_correct/ad_wrong`, `skipped_correct/skipped_wrong`.
- Se algum `_wrong > 0`, marca o item na fila com `error_code='audit_flag'` e comentário, sem cancelar (para revisão manual).

### Fase 2: Estender `reconcile-identities` para cobertura completa

Após a etapa 5 (desligados) atual, adicionar:

**5b. Ativos sem conta no Entra** — Para cada colab `status='ativo'` sem match no `entraIdx` (por `entra_id` e por `email`), enfileirar `create_if_not_exists` com payload de identidade. Deduplica por `colaborador_id`.

**5c. Ativos com conta disabled** — Para cada colab `status='ativo'` cujo `entraIdx` retorna `accountEnabled=false`, enfileirar `enable_entra`. Deduplica.

**5d. Órfãs no Entra** — Para cada `entraIdx` sem match em `colaboradores` (via `entra_id`, `mail`, `upn`) E não em `contas_admin_conhecidas` E `accountEnabled=true`, enfileirar `review_orphan_entra` com payload contendo `entra_id`, `mail`, `upn`, `displayName`. Deduplica.

**5e. Divergência de atributos** *(escopo separado — pode ficar para depois)* — comparar `department/jobTitle/companyName` entre colab e Entra, enfileirar `update_entra` quando diferir.

Novos contadores em `stats`: `create_enqueued`, `enable_enqueued`, `orphans_flagged`.

### Fase 3: UI e relatório

- Painel de reconciliação em Integrações exibe todos os contadores no `job.message` (já feito, precisa só ler os novos campos).
- Auditoria da reconciliação inclui breakdown completo.
- Toast de "Rodar ciclo diário" mostra "N criações · N reativações · N órfãs · N desligamentos Entra · N desligamentos AD".

### Ordem de execução

1. **Fase 1 primeiro** para responder objetivamente "está 100%?" com números da amostragem sobre os itens ATUAIS.
2. Se a Fase 1 mostrar wrongs, corrigir root cause antes da Fase 2.
3. **Fase 2** para eliminar as lacunas de cobertura (criações, reativações, órfãs).
4. Fase 5e (atributos) opcional em passo posterior.

### Fora de escopo

- Comparação diária de grupos/licenças (fluxo separado).
- Auto-cancelar itens flagados na Fase 1 (só marca; usuário decide).
