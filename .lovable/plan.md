## Problema

Ao clicar em **"Reconciliar contra Entra"**, o processo é executado em modo síncrono dentro da Edge Function `process-iam-queue`:

- Faz **uma chamada HTTP separada ao Microsoft Graph por item** (3.819 chamadas sequenciais).
- Cada chamada leva ~200-500ms → o processo total demora **15-30 minutos**.
- Edge Functions têm limite de execução (~150s / desconexão do cliente encerra o request).
- Como o `fetch` está atrelado à aba do navegador, sair da tela **aborta a requisição** e o worker para no meio.

Por isso o usuário precisa ficar clicando várias vezes: cada clique processa só o que couber antes do timeout, e o restante fica pendente.

## Solução

Rodar a reconciliação em **background persistente** com progresso rastreável, retornando resposta imediata ao cliente. A UI passa a **acompanhar o job** em vez de segurar a requisição HTTP.

### 1. Backend — `process-iam-queue` modo `reconcile-create`

- Ao receber `mode: "reconcile-create"`, criar um registro em `sync_jobs` (`tipo = 'reconcile_entra'`, `status = 'running'`, `total`, `processados`, `sucesso`, `erros`).
- Disparar o loop de reconciliação via `EdgeRuntime.waitUntil(...)` — a Edge Function retorna **`202 Accepted` com `{ job_id }` imediatamente**, e o loop continua executando no servidor mesmo se o cliente fechar a aba.
- Substituir os lookups individuais por **Microsoft Graph `$batch` (20 usuários por requisição HTTP)** — reduz o tempo total em ~20x e diminui chance de throttling.
- Atualizar `sync_jobs` a cada bloco processado (`processados`, `sucesso`, `erros`, `updated_at`), e marcar `status = 'success' | 'error'` no final com resumo.
- Guarda de concorrência: se já existir um `sync_jobs` `reconcile_entra` com status `running`, retornar 409 com o `job_id` em execução (evita disparos duplicados).

### 2. Frontend — `AprovacaoIAMPage.tsx`

- `reconcileMutation` passa a apenas **iniciar o job** (POST → recebe `job_id`) e mostrar toast "Reconciliação iniciada em segundo plano".
- Novo hook `useReconcileJobStatus` faz polling em `sync_jobs` a cada 5s enquanto houver job `running` (ou toda vez que a página abre) para exibir:
  - Progresso no card superior: `Reconciliando: 1.240 / 3.819 verificados · 812 canceladas · 428 mantidas`.
  - Botão desabilitado enquanto `running`, com spinner.
- Ao concluir: toast final com o resumo, refetch da fila e da contagem.
- Como o estado vive no banco, **o progresso continua visível mesmo se o usuário sair e voltar depois** — a próxima abertura da página já mostra o job em andamento ou o último resultado.

### 3. Sem mudanças de schema

`sync_jobs` já existe com os campos usados por outros syncs (tipo, status, total, processados, sucesso, erros, mensagem, updated_at). Reaproveitamos o mesmo padrão.

## Arquivos afetados

- `supabase/functions/process-iam-queue/index.ts` — modo reconcile passa a rodar em background com Graph `$batch` e registro em `sync_jobs`.
- `src/pages/AprovacaoIAMPage.tsx` — mutation dispara e retorna; adiciona polling de `sync_jobs` e UI de progresso.

## Resultado esperado

- Um único clique reconcilia **todos os 3.819 itens** sem intervenção manual.
- Sair da tela **não interrompe** — o job continua no servidor.
- A UI mostra progresso em tempo real e o resultado final quando o usuário voltar.
