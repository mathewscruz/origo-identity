

## Plano: Mecanismo de retry automatico para provisionamento Entra ID

### Problema

Quando o cargo de um colaborador e alterado, o sistema gera corretamente as entradas `assign_group`/`assign_license` na `iam_queue`. Porem, se o usuario ainda nao foi replicado do AD local para o Entra ID, o agente PowerShell falha e a solicitacao fica com status `failed` permanentemente — sem retry.

O fluxo atual:
```text
Cargo alterado → provisionCargoAcessos → iam_queue (assign_group) → Agente tenta → Falha → FIM
```

O fluxo correto:
```text
Cargo alterado → iam_queue (assign_group) → Agente tenta → Falha (user_not_found) → Aguarda → Retry → Sucesso
```

### Solucao

Adicionar um mecanismo de retry com backoff na `iam_queue` e na `iam-agent-api`.

---

### 1. Migracao: adicionar coluna `next_retry_at` na `iam_queue`

```sql
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.iam_queue ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 10;
```

- `next_retry_at`: quando a proxima tentativa pode ser feita (null = imediato)
- `max_retries`: maximo de tentativas (default 10, cobrindo ~24h com backoff)

### 2. Alterar `iam-agent-api` — endpoint `POST /update`

Quando o agente reportar falha com erro retentavel:
- Se `status = "failed"` e `error_code` esta na lista de erros retentaveis (`user_not_found`, `user_not_synced`, `not_found_in_entra`)
- E `retry_count < max_retries`
- Entao: incrementar `retry_count`, calcular `next_retry_at` com backoff exponencial (5min, 10min, 20min, 40min...), manter `status = "pending"` em vez de `failed`
- Se `retry_count >= max_retries`: manter `status = "failed"` (desistir)

### 3. Alterar `iam-agent-api` — endpoint `GET /pending`

Ajustar a query para retornar:
- Items com `status = "pending"` E (`next_retry_at IS NULL` OU `next_retry_at <= now()`)
- Isso garante que items em retry so aparecem apos o tempo de espera

### 4. Atualizar a interface da Fila de Provisionamento

- `FilaProvisionamentoPage.tsx`: mostrar coluna `retry_count` e indicador visual quando um item esta aguardando retry
- `SolicitacaoDetalhePage.tsx`: exibir `retry_count`, `next_retry_at` e `max_retries` nos detalhes

---

### Comportamento esperado

Para o caso "Teste IAM 6":
1. Cargo atribuido → sistema cria `assign_group` pendente
2. Agente tenta atribuir grupo no Entra ID → usuario nao encontrado → retorna `error_code: "user_not_found"`
3. API recebe, incrementa `retry_count` para 1, define `next_retry_at` = agora + 5 min, mantem `status = "pending"`
4. Apos 5 min, `GET /pending` retorna o item novamente
5. Agente tenta de novo → se usuario ja replicou, sucesso. Se nao, retry com 10 min
6. Repete ate `max_retries` (10 tentativas, ~24h total)

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Migracao | Adicionar `next_retry_at` e `max_retries` em `iam_queue` |
| Editar | `supabase/functions/iam-agent-api/index.ts` — logica de retry no POST /update e filtro no GET /pending |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — exibir retry_count |
| Editar | `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` — exibir detalhes de retry |

