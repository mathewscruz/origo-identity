Plano completo em três frentes, conforme aprovado. Referências file:line vêm da auditoria.

## 1) Divergência CSV × Entra → itens de aprovação

Hoje o sistema é write-only: nenhum lugar lê `accountEnabled` do Entra para comparar com `colaboradores.status` (auditoria §3). Vou fechar isso dentro do "Reconciliar contra Entra" que já existe.

**Backend — `supabase/functions/process-iam-queue/index.ts`**

- Em `fetchAllGraphUsers` (`:594-606`) adicionar `accountEnabled` ao `$select`.
- Em `buildEntraUserIndex` (`:624-667`) persistir `accountEnabled` no objeto indexado.
- Dentro do `runReconcile`, após a fase `vinculando_colaboradores`, adicionar nova fase `checando_divergencia_status`:
  - Para cada colaborador com match no Entra:
    - Se `colab.status IN ('desligado','inativo')` E `entra.accountEnabled === true` → enfileirar `disable_entra_account` (status `pending`, gate promove a `waiting_approval`).
    - Se `colab.status === 'ativo'` E `entra.accountEnabled === false` E não há evento leaver em `eventos_jml` recente → enfileirar `enable_entra_account`.
  - Deduplicação: só enfileirar se **não existir** item aberto (`status IN ('pending','waiting_approval')`) para o mesmo `colaborador_id` + `action_type`. Usa a mesma normalização já existente em `enqueue.ts`.
  - Payload inclui `reason: 'status_divergence'`, `colab_status`, `entra_account_enabled`, `entra_id`, `displayName`, `mail`.
- Somar no relatório final do `sync_jobs.message` e no `auditoria`: `X divergências ativa→inativa · Y divergências inativa→ativa`.

**Frontend — `src/pages/AprovacaoIAMPage.tsx`**

- Adicionar rótulos em `actionLabels` (`:43-62`):
  - `disable_entra_account: "Desabilitar conta (Entra)"`
  - `enable_entra_account: "Reabilitar conta (Entra)"`
- No detalhe (`Sheet`, `:646-697`) quando `payload.reason === 'status_divergence'`, mostrar bloco:
  > "Base: <status DB> · Entra: <habilitado/desabilitado>"
  para o aprovador entender o motivo antes de decidir.

## 2) Contas órfãs no Entra → itens de revisão

**Backend — `process-iam-queue/index.ts`, dentro do `runReconcile`**

- Nova fase `detectando_orfaos` após checagem de divergência:
  - Para cada usuário Entra que **não** casou com nenhum colaborador (`matched === false`), aplicar filtros de exclusão:
    - Domínio `@` estranho ao tenant corporativo (guest, `#EXT#`).
    - Contas de sistema / conhecidas em `contas_admin_conhecidas` (tabela já existe).
    - Prefixos técnicos (`svc.`, `admin.`, `test.`, `sa.`) — configurável via `parametros(chave='iam_orphan_ignore_prefixes')`.
  - Restantes são "órfãos": enfileirar `review_orphan_entra` com `status='waiting_approval'` (pula gate: já nasce em revisão).
  - Payload: `entra_id`, `displayName`, `userPrincipalName`, `mail`, `accountEnabled`, `createdDateTime`, `lastSignInDateTime` (adicionar `signInActivity` ao `$select` do Graph — só está disponível com licença adequada; se vier `null`, apenas omitir do payload).
  - Deduplicação por `entra_id` — não recriar se já existe item aberto.

**Frontend — `AprovacaoIAMPage.tsx`**

- Adicionar `review_orphan_entra: "Revisar conta órfã (Entra)"` em `actionLabels`.
- Aprovar orfão = enfileirar `disable_entra_account` para aquele `entra_id` (novo passo em `approveMutation` quando `action_type === 'review_orphan_entra'`).
- Recusar = marca `status='rejected'`, `rejection_reason='conta legítima'` e grava `contas_admin_conhecidas` para não voltar (via edge helper).

## 3) Saúde e otimização do fluxo de aprovação

Baseado nos gaps 5.2 a 5.10 da auditoria. Escolhi os que afetam usuário/perf direto.

**a. Índices em `iam_queue`** (gap 5.6)
Migração adicionando:
```
CREATE INDEX IF NOT EXISTS ix_iam_queue_status_action ON public.iam_queue(status, action_type);
CREATE INDEX IF NOT EXISTS ix_iam_queue_status_created ON public.iam_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_iam_queue_colab_status ON public.iam_queue(colaborador_id, action_type, status);
```
Elimina seq scans do worker (`:1173-1185`) e da dedup do item 1.

**b. Backfills em batch** (gaps 5.4 / 5.5)
Trocar os loops `Promise.all` individuais em `process-iam-queue/index.ts:1046-1052` e `:1083-1097` por uma RPC única `apply_reconcile_updates(queue_updates jsonb, colab_updates jsonb)` que faz `UPDATE ... FROM jsonb_to_recordset(...)`. Reduz N queries a 2 para o Postgres. Migração cria a função como `SECURITY DEFINER` com `search_path=public`.

**c. Remover polling redundante** (gap 5.7)
Em `AprovacaoIAMPage.tsx:165`, remover `refetchInterval: 15000` da query `iam-approval-queue`. Realtime (`:200-209`) já cobre.

**d. Filtros com todas as opções** (gap 5.2)
Trocar `filterOptions` (`:174-186`) por RPC `iam_queue_distinct_actions_origins(status_filter text[])` retornando `DISTINCT action_type, requested_by`. Some the `.limit(2000)` cliff.

**e. Busca server-side** (gap 5.3)
Passar `busca` como parâmetro `.or("target_identity.ilike.%q%,payload_json->>displayName.ilike.%q%")` na query paginada; remover o filtro client-side. Assim busca funciona na fila inteira.

**f. Histórico completo** (gap 5.10)
Remover o `.not("approved_at","is",null)` (`:158`). Passar a mostrar cancelamentos automáticos (ex.: pelo reconciliador) no Histórico. Coluna Status já distingue.

**g. Rótulo "Selecionar tudo"** (gap 5.9)
Renomear para "Selecionar página" — deixa claro que é a página corrente. Sem mudança de comportamento.

## Fora de escopo agora

- Bypass de gate para suspensão preventiva do `preLeaver` (gap 5.1) — decisão de segurança separada, prefiro perguntar antes de mexer.
- Reordenação de filas por prioridade / SLA.

## Ordem de execução

1. Migração: índices + RPC `apply_reconcile_updates` + RPC `iam_queue_distinct_actions_origins`.
2. Backend `process-iam-queue`: Graph `$select`, novas fases (divergência + órfãos), enqueue com dedup, uso das RPCs.
3. Frontend `AprovacaoIAMPage`: rótulos, detalhe com motivo, aprovar-órfão, histórico sem filtro, busca server-side, remoção do polling, rename.

## Como validar

- Rodar "Reconciliar contra Entra" com o gate ligado; conferir na tabela `iam_queue` que aparecem `disable_entra_account` / `enable_entra_account` / `review_orphan_entra` como `waiting_approval`, e nada duplicado ao rodar 2x seguidas.
- Aprovar um `disable_entra_account` e verificar em `process-iam-queue` que o Graph PATCH `accountEnabled=false` é enviado.
- `EXPLAIN` da query do worker antes/depois para confirmar uso do novo índice.
- Histórico exibindo os `cancelled` da reconciliação anterior.
