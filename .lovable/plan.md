## Diagnóstico do último sync (job `47da616e…`, 01/07)

Fiz uma avaliação direta na base. O resumo é: **o import bruto funcionou, mas a etapa de "distinguir quem já existe no AD/Entra vs quem precisa ser criado/desligado" está incompleta**.

### Números atuais da base

| Métrica | Valor |
|---|---|
| Colaboradores no CSV (origem=csv) | 3.910 |
| Status = ativo | 604 |
| Status = desligado | 3.287 |
| Com `sam_account_name` preenchido | 3.912 (100%) |
| Com `entra_id` preenchido (link real com Entra) | **13** |
| Com `email` | 3.785 |
| Eventos JML `joiner pendente` | **7.788** (esperado ≈3.899) |
| Eventos JML `leaver` gerados no último sync | **0** (deveria haver p/ desligados novos) |
| Fila `create_if_not_exists` pending (hoje) | 3.899 |
| Fila `create_if_not_exists` cancelled (Abr) | 3.879 |

### O que está certo
- Parser do CSV importou os 3.910 colaboradores corretamente (nomes, matrícula, cargo, área, empresa, gestor).
- Watchdog marcou o job travado como `error` e a UI voltou a permitir novo sync.
- Fila IAM tem 3.899 ações `create_if_not_exists` prontas — é o caminho correto para o `iam-agent-api` (AD) e depois `process-iam-queue` (Entra) resolverem "existe? cria : linka".

### O que está errado ou incompleto

1. **Reconciliação com Entra ID não está acontecendo no import.**
   Apenas 13 de 3.912 colaboradores têm `entra_id` gravado. O `sync-csv-colab` gera `sam_account_name` e `email` deterministicamente, mas **nunca consulta Graph API** para descobrir se o usuário já existe. Resultado: quem já está no Entra vai virar `create_if_not_exists` e só será "descoberto" quando o agente AD/Entra rodar item a item. Isso é lento e mascara o status real na UI.

2. **Reconciliação com AD só existe via agent, não no import.**
   Mesmo problema — não há lookup no AD durante o import para linkar `sam_account_name` a uma conta pré-existente. Todo mundo entra como "novo".

3. **Nenhum evento `leaver` foi gerado para os desligados.**
   3.287 estão marcados `desligado` na base, mas o último sync gerou apenas `joiner`. O código de comparação (fase `events` do `sync-csv-colab`) foi interrompido pelo timeout **antes** de processar movers/leavers, então quem deveria desabilitar não entrou na fila.

4. **Eventos JML `joiner` duplicados/acumulados (7.788).**
   Há eventos de execuções anteriores nunca marcados como `executado`. Precisa dedup por `colaborador_id + tipo + status=pendente`.

5. **3.879 itens `create_if_not_exists` ficaram `cancelled` em abril** — provavelmente da execução travada anterior. Precisa entender se foi cancelamento intencional (watchdog) ou perda de trabalho.

---

## Plano de correção

### Etapa 1 — Reconciliação no import (sync-csv-colab)

Adicionar, **antes** da fase `events`, uma sub-fase `reconcile`:

1. Coletar todos os emails/UPNs dos colaboradores importados.
2. Chamar Microsoft Graph em lotes (`/users?$filter=mail in (...) or userPrincipalName in (...)`, batch de 15 via `$batch`) para descobrir quem já existe no Entra.
3. Para cada match, gravar `entra_id` e marcar internamente como "já existente".
4. (Opcional, mesma etapa) chamar `iam-agent-api` num endpoint novo `POST /ad/lookup-bulk` que devolve quais `sam_account_name` já existem no AD on-prem.
5. Usar esse mapa para decidir na fase `events`:
   - Não existe em nenhum lado → `joiner` real + `create_if_not_exists`.
   - Existe em um lado só → `create_if_not_exists` só no lado faltante.
   - Existe nos dois → apenas link, sem joiner.

Time-budget: 30s dedicados à reconciliação (Graph batch resolve ~3.900 em segundos).

### Etapa 2 — Gerar leavers/movers corretamente mesmo sob pressão

Na fase `events`, processar na ordem **leavers → movers → joiners** (hoje é o inverso) para que, se houver timeout, os desligamentos (mais críticos) já tenham entrado na fila. Aplicar o mesmo `PROVISION_BUDGET_MS` só ao trecho de provisionamento pesado.

### Etapa 3 — Dedupe de eventos JML pendentes

Migration única:
- Marcar como `executado` (com nota "reconciliado por import") os `eventos_jml` `joiner pendente` cujo colaborador já tem `entra_id` OU já tem `iam_queue.create_if_not_exists` com status `success`.
- Criar unique constraint parcial: `unique(colaborador_id, tipo) where status='pendente'`.

### Etapa 4 — Reprocessar o backlog atual

1. Rodar a reconciliação em modo "só marca `entra_id`, não gera evento" para o snapshot atual (script one-off na Edge Function).
2. Gerar eventos `leaver` para os 3.287 desligados que não têm evento leaver executado.
3. Deixar a fila `create_if_not_exists` (3.899 pending) rodar normalmente via `iam-agent-api` + `process-iam-queue`. Após reconciliação, muitos vão virar no-op (usuário já existe → só linka).

### Etapa 5 — UI de diagnóstico

Adicionar na tela **Integrações** um card "Reconciliação AD/Entra" mostrando:
- Total no CSV
- Já linkados no Entra (verde)
- Já linkados no AD (verde)
- A criar no Entra (amarelo)
- A criar no AD (amarelo)
- A desabilitar (vermelho)
- Órfãos (existem no AD/Entra mas não no CSV)

Assim dá pra validar visualmente o resultado de cada sync.

---

## Detalhes técnicos

- **Arquivo principal:** `supabase/functions/sync-csv-colab/index.ts`
  - Nova função `reconcileWithEntra(colabs, sb, token)` usando `POST /$batch` do Graph.
  - Nova função `reconcileWithAd(colabs)` chamando `iam-agent-api` (endpoint a criar no agent PowerShell: `Get-ADUser -Filter` em batch).
  - Reordenar loop de eventos: leavers → movers → joiners.
- **Migration:** dedup + unique parcial em `eventos_jml`.
- **Nova Edge Function:** `reconcile-identities` (one-off, invocável pela UI) para rodar as etapas 4.1 e 4.2 sem precisar reimportar CSV.
- **UI:** novo componente `ReconciliationCard.tsx` em `IntegracoesPage.tsx` alimentado por uma view SQL `v_reconciliation_stats`.
- **Agent PowerShell (`iam-agent-api`):** endpoint novo `POST /ad/lookup-bulk` que aceita `["sam1","sam2",...]` e retorna quais existem.

### Ordem de execução sugerida

1. Migration de dedup JML (rápido, desbloqueia UI).
2. Edge Function `reconcile-identities` + botão na UI → rodar agora contra o backlog.
3. Refatorar `sync-csv-colab` com reconciliação + reordenação de eventos.
4. Card de reconciliação na UI.
5. Endpoint AD `lookup-bulk` no agent (pode ser feito em paralelo; sem ele, reconciliação Entra-only já resolve ~90%).

Quer que eu siga com esse plano ou prefere focar primeiro só na Etapa 4 (reprocessar backlog atual sem mexer no fluxo)?
