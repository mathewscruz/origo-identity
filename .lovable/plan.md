

## Plano: Corrigir sync-entra-groups para trazer todos os grupos

### Diagnostico

A tabela tem apenas 16 grupos e 0 on-premises. As permissoes Azure estao corretas (screenshot confirma `Group.Read.All`, `Group.ReadWrite.All`, `Directory.Read.All` com Admin Consent). O codigo de paginacao parece correto, entao o problema provavel e:

1. **Timeout da Edge Function**: O upsert grupo-a-grupo (SELECT + INSERT/UPDATE para cada grupo) e muito lento. Se o Entra ID tem centenas de grupos, a funcao expira antes de terminar (limite de 60s em Edge Functions).
2. **Erro silencioso**: Se a Graph API retorna corretamente mas o loop de insercao e interrompido por timeout, apenas os primeiros grupos sao salvos.

### Correcoes

#### 1. Usar upsert em batch (ao inves de 1 query por grupo)

Substituir o loop individual `SELECT + INSERT/UPDATE` por um unico `upsert` em batch usando a chave `entra_id`. Isso reduz de ~3 queries por grupo para 1 query total.

```text
Antes: N grupos × 2-3 queries = centenas de queries (timeout)
Depois: 1 fetch paginado + 1 upsert batch = 2-5 queries total
```

#### 2. Adicionar logging detalhado

Logar o numero de grupos recebidos da Graph API antes de iniciar o upsert, para confirmar que a API retorna todos.

#### 3. Processar em batches de 500

Para evitar payloads muito grandes no upsert, processar em blocos de 500 grupos.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-entra-groups/index.ts` — upsert em batch, logging |

