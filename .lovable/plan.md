## Objetivos

1. **Aprovação instantânea** — reduzir latência entre clicar "Aprovar" e ver o item sair da fila / começar a executar.
2. **Paginação** na tela `/aprovacao-iam` (hoje puxa até 1000 e renderiza tudo — some da tela e trava filtros).
3. **Corrigir erro `not_found` em massa** — no CSV, ao invés de enfileirar `create_if_not_exists` para 3.899 pessoas, fazer varredura prévia no Entra ID e só enfileirar os que realmente faltam.

---

## Diagnóstico do que está acontecendo hoje

### Latência ao aprovar
- `approveMutation` (em `AprovacaoIAMPage.tsx` linhas 179–200) faz `UPDATE status='pending'` e depois insere auditoria — **mas não dispara o worker**.
- O worker (`process-iam-queue`) só roda quando alguém chama `triggerEntraProcessing()` ou pelo botão manual. Enquanto isso, o item fica em `pending` esperando o próximo tick, dando a impressão de "não fez nada".
- A tela usa `refetchInterval: 10000` — mesmo com realtime ligado, o loading state de 200 itens travando renderiza lento.

### `Retry 1/10 — not_found` em massa
- No screenshot são todos `create_if_not_exists` do CSV. O AD Agent tenta encontrar o usuário no AD, não acha, marca como `user_not_found` → entra em retry exponencial (5min, 10min, 20min…) até 10 tentativas.
- Isso acontece porque `sync-csv-colab` (linha ~820) enfileira `create_if_not_exists` para **todo colaborador novo do CSV**, sem antes verificar se ele já existe no AD/Entra por outros meios (`onPremisesSamAccountName`, `mail`, `userPrincipalName`).
- Muitos desses 3.899 já existem no Entra ID mas com identidade diferente (email empresarial vs `@ebessolar.local`, ou casing diferente). O agente PowerShell no cliente devolve `not_found` porque procura por SAM e o SAM foi gerado pela regra do CSV, que nem sempre bate.

### Paginação
- Query atual: `.limit(1000)` + filtro/render client-side. Para 3.911+ itens, a tabela renderiza tudo de uma vez — daí o "demorou para atualizar a tela".

---

## Plano de mudanças

### 1. Paginação server-side em `AprovacaoIAMPage.tsx`
- Trocar o `useQuery` por paginação com `range()`:
  - 50 itens por página (padrão), navegação com componente `TablePagination` já existente.
  - Query paralela leve com `count: 'exact', head: true` para o total.
- Mover filtro por `action_type`/`origem` para o servidor (`.eq('action_type', …)`, `.eq('requested_by', …)`) para reduzir payload. Busca por texto continua client-side apenas na página atual.
- Manter realtime, mas em vez de refetch completo, invalidar só o `queryKey` da página atual.

### 2. Aprovação imediata + UI otimista
- No `onMutate` da `approveMutation`, remover otimisticamente os IDs aprovados do cache (item some da tela na hora).
- Após o `UPDATE`, disparar `triggerEntraProcessing(true)` **em background** (fire-and-forget) — o worker começa a executar antes mesmo do toast fechar.
- Mesmo pattern para `rejectMutation` (só remove da tela, sem trigger).
- Reduzir o `refetchInterval` do modo "waiting" para 5s enquanto houver aprovação em andamento; voltar para 30s quando idle.
- Toast passa a mostrar "Aprovado — executando…" com ação de "Ver histórico".

### 3. Reduzir `not_found` na criação em massa (a peça central)

Nova função `pre-check-identities` no fluxo do `sync-csv-colab` (executada **antes** de enfileirar `create_if_not_exists`):

```text
CSV parsed → lista de novos joiners (toInsert)
  ↓
[novo passo] pre-check no Entra ID em lote:
  - Graph batch: /users?$filter=mail in (...) or userPrincipalName in (...) or onPremisesSamAccountName in (...)
  - Batches de 15 filtros por request (limite Graph OData)
  ↓
Marca em cada joiner: entra_id_encontrado? sim / não
  ↓
Se SIM  → grava colaborador com entra_id preenchido, NÃO enfileira create_if_not_exists
          (apenas registra JML "joiner_existing_identity" e provisiona acessos do cargo)
Se NÃO  → enfileira create_if_not_exists normalmente
```

Complementos:
- Se o joiner é encontrado no Entra mas o `samAccountName` do CSV diverge, usar o SAM do Entra (verdade em produção) e atualizar o registro em `colaboradores`.
- Enfileirar `create_if_not_exists` para o AD local **apenas quando `entra_id_encontrado = false E existe agente AD configurado**. Se não houver agente, cair para "criar somente no Entra" via novo `action_type = create_entra` (a implementar no `process-iam-queue`).
- Para os 3.899 já enfileirados hoje: uma job manual (botão "Reconciliar fila `create_if_not_exists`" na página de Aprovação IAM, admin only) que pega os `waiting_approval`/`pending` desse tipo, roda o mesmo pre-check e:
  - marca como `cancelled` os que já existem (com `result_message: "usuário já existe no Entra — reconciliado"`),
  - deixa em `waiting_approval` só os que realmente faltam.

### 4. Ajuste no retry para `not_found`
- Hoje `iam-agent-api` re-tenta `user_not_found` até 10x. Depois da mudança #3, isso praticamente some. Ainda assim, baixar `max_retries` de 10 → 3 para `user_not_found` (não é falha transitória de rede — é ausência real do usuário) e mudar `result_message` para uma ação clara: "Usuário não existe no AD — aprovar criação manual ou revisar identidade".

---

## Detalhes técnicos

### Arquivos afetados
- `src/pages/AprovacaoIAMPage.tsx` — paginação, UI otimista, banner de reconciliação.
- `src/lib/triggerEntraProcessing.ts` — reaproveitado (fire-and-forget após approve).
- `supabase/functions/sync-csv-colab/index.ts` — pre-check antes de enfileirar `create_if_not_exists`.
- `supabase/functions/process-iam-queue/index.ts` — novo endpoint `POST /reconcile-create-queue` (varre a fila existente contra Graph e cancela duplicados).
- `supabase/functions/iam-agent-api/index.ts` — `max_retries` reduzido para 3 quando `error_code === "user_not_found"`.

### Sem migração de banco
Nenhuma alteração de schema; apenas UPDATEs de status via lógica.

### Diagrama de fluxo (novo)

```text
sync-csv-colab
   │
   ├── parse CSV → toInsert[]
   │
   ├── pre-check Entra (Graph batch)
   │      │
   │      ├── found      → grava entra_id, NÃO enfileira create
   │      └── not found  → enfileira create_if_not_exists (waiting_approval)
   │
   └── UI aprovador
          │
          ├── clica "Aprovar" → UPDATE status=pending + fire-and-forget triggerEntraProcessing
          │                       ↓
          │                    process-iam-queue roda imediatamente
          │
          └── (opcional) "Reconciliar fila" → cancela create_if_not_exists que já existem no Entra
```

---

## Fora de escopo
- Reescrever a lógica de retry global (só ajuste pontual em `user_not_found`).
- Mexer no fluxo Pré-Desligamento (segue como está).
- Alterar RLS / roles.