## Diagnóstico

Consultei a base. Dos 77 `create_if_not_exists` que ainda estão em `waiting_approval`:

- **26 já estão vinculados a um colaborador** (`colaborador_id` preenchido) — **todos com `status = 'desligado'`**.
- **51 estão órfãos** (`colaborador_id = NULL`). Cruzando pelo e-mail do payload contra `colaboradores`, **todos batem em colaboradores `desligado`** (o cruzamento retorna 57 linhas porque alguns e-mails têm duplicidade histórica, mas nenhum bate em colaborador `ativo`).
- **Zero itens ativos.** Ou seja, não há ninguém que "ainda precise ser criado no AD/Entra". É 100% lixo de desligados que ficou preso porque:
  1. Meu último passo de reconciliação resolve órfãos por e-mail/SAM/matrícula, mas o cancelamento por "desligado" só é executado **depois** da tentativa de match no Entra — e para esses 51 o `colaborador_id` continua nulo no momento da decisão, então a regra "desligado → cancelar" não dispara.
  2. O `sync-csv-colab` continua enfileirando `create_if_not_exists` para linhas do CSV que, na base, correspondem a colaboradores já marcados como `desligado` (reentrada, homônimos, e-mails antigos, etc.), então mesmo depois de limpar a fila volta a encher.

## O que vou corrigir

### 1. `supabase/functions/process-iam-queue/index.ts` — `runReconcile`

- Na resolução de órfão, **gravar `colaborador_id` no item em memória antes de decidir** (não só no update em lote), para que a regra "desligado → cancelar" enxergue o vínculo já nesta execução.
- Reordenar a decisão por item:
  1. Se resolveu colaborador e `status = 'desligado'` → cancelar como `cancelledDesligado` (não tenta Entra, não gasta match).
  2. Senão, tenta match no Entra → `cancelledEntra` + grava `entra_id`.
  3. Senão → `kept`.
- Persistir `colaborador_id` no `iam_queue` em lote, como já faz hoje, mas sem depender disso para a decisão.

Resultado esperado: os 77 caem para **0** na próxima execução de "Reconciliar contra Entra".

### 2. `supabase/functions/sync-csv-colab/index.ts` — bloqueio na entrada

- Antes de enfileirar `create_if_not_exists` para uma linha do CSV, checar se já existe colaborador com mesma chave (email/matrícula) e `status = 'desligado'`.
- Se existir: **não enfileirar** e registrar no `sync_jobs`/auditoria como "criação ignorada — colaborador desligado".
- Isso evita que a fila volte a acumular esse tipo de item a cada sync do CSV.

### 3. UI — `src/pages/AprovacaoIAMPage.tsx`

- Apenas ajuste de texto no banner/descrição: deixar explícito que a reconciliação também cancela criações de colaboradores desligados, e que o sync de CSV agora ignora desligados na entrada. Sem mudança de lógica.

## Observação para a sua pergunta

> "Se estiverem ativos, ainda precisam ser criados no AD/Entra, certo?"

Certo — mas hoje **não há nenhum ativo** entre os 77. Se depois do fix aparecer algum em `waiting_approval`, aí sim significa "colaborador ativo que ainda não existe no Entra" e deve seguir para aprovação/criação normal. A regra continua: só cancelamos automaticamente quando é `desligado` **ou** quando já existe no Entra.
