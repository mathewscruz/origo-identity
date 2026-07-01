## Diagnóstico do run das 17:43

Auditoria do último run mostra evidências claras de que **não** rodou correto:

- `total_colabs: 1000` — a função só viu 1000 dos 3912 colaboradores porque `sb.from("colaboradores").select(...)` (sem `.range()`) cai no default de 1000 do PostgREST.
- `linked_entra: 0` — todas as tentativas de update falharam com `duplicate key value violates unique constraint "colaboradores_entra_id_key"`. Emails/UPNs distintos apontam para o mesmo Entra user (já vinculado a outro colab), e o código não trata esse conflito.
- `joiners_reconciled: 300`, `leavers_generated: 934`, `disable_enqueued: 1868` — números batem entre si (934 × 2 = 1868), mas cobrem só a fatia de 1000 processada.
- Sem persistência em `sync_jobs` para esse kind → recarregar a página mata qualquer sinal de "rodando".

E o card `Reconciliar Identidades` do `IntegracoesPage.tsx` tem bug na fórmula de **A reconciliar** (`total - linked - desligados` pode dar negativo e ignora que desligados também podem estar linkados).

## Plano

### 1) Backend — `supabase/functions/reconcile-identities/index.ts`

- Paginar `colaboradores` em blocos de 1000 (`.range(offset, offset+999)` até esgotar).
- Ao gravar `entra_id`, detectar `23505` (unique violation) e registrar em `stats.duplicates[]` com `{ colab_id, entra_id, motivo: "já vinculado a outro colaborador" }` em vez de tratar como erro fatal.
- Mesma pagination para eventos_jml/iam_queue lookups (já usa chunk 500 — ok).
- Criar/atualizar linha em `sync_jobs` com `kind='reconcile_identities'` e escrever fases:
  - `carregando_colabs` → `consultando_graph` (com contador `checked/total`) → `atualizando_vinculos` → `resolvendo_joiners` → `gerando_leavers` → `enfileirando_disable` → `done`/`error`.
  - `progress` numérico, `updated_at` a cada fase para permitir detecção de stale (5 min).
- No `finally`, promover job `running` órfão para `error` (mesmo padrão do `process-iam-queue`).
- Auditoria final continua sendo escrita.

### 2) Frontend — `src/pages/configuracoes/IntegracoesPage.tsx`

- Adicionar `useQuery` polling em `sync_jobs` filtrado por `kind='reconcile_identities'` (mesmo padrão do `useSyncJobsCsv`), com `refetchInterval` 3s enquanto job fresco+running.
- Trocar estado local `reconciling` por leitura do job persistente (`reconRunning`, `reconStale` via `updated_at > 5min`).
- Painel de progresso equivalente ao `CsvProgressPanel`: label da fase em PT, timestamp relativo, warnings do run (duplicatas), botão `Rodar reconciliação` desabilitado enquanto fresh+running.
- Se stale: banner "Última execução parou em X% — rode novamente" e libera botão.
- Corrigir card **A reconciliar**: nova query dedicada (`status='ativo'` + `entra_id IS NULL` + `email IS NOT NULL`) em vez da subtração quebrada. Mesma coisa para os outros stats: garantir que refletem `count(*, {head:true})` reais, sem cap de 1000.
- Refetch `reconcileStats` quando job vira `done`.

### 3) Validação do ciclo diário (create/change/disable automático)

Segundo a memória do projeto, todos os crons estão desligados — o "diário" é operado manualmente. O fluxo atual é:

```text
sync-csv-colab  →  reconcile-identities  →  process-iam-queue
   (RH sobe)       (linka + gera JML)        (executa no Entra)
```

- Adicionar um botão único **"Rodar ciclo diário completo"** no card de Reconciliação que orquestra as três funções em sequência via um novo endpoint `run-daily-cycle` (edge function fina que chama as 3 e escreve fases em `sync_jobs` kind='daily_cycle'). SharePoint CSV como passo 1 (opcional, só se `spSyncing` não estiver ativo).
- O painel de progresso do card mostra em qual etapa está.
- Validação embutida ao fim: contadores `colabs_criados`, `colabs_atualizados`, `colabs_desligados`, `disable_enfileirados`, `disable_executados` no toast final e no `auditoria`.
- Documentar o fluxo no `CardDescription` para deixar claro para o operador.

### Ordem de execução

1. Backend `reconcile-identities` (paginação + trap de duplicate + tracking em `sync_jobs`).
2. Nova edge function `run-daily-cycle`.
3. Frontend `IntegracoesPage` (painel de progresso, fórmula corrigida, botão de ciclo diário).
4. Rodar manualmente 1× e conferir que `total_colabs` no auditoria bate com 3912 e que `linked_entra + duplicates + already_linked` cobre `checked_entra`.

### Fora de escopo

- Reativar crons (memória diz que syncs são manuais por decisão de produto).
- Mexer em `sync-csv-colab` ou `process-iam-queue` (já foram ajustados em passos anteriores).
