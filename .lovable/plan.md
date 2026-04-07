

## Plano: Corrigir atribuição de apps — função não foi deployada + resolução de ID incompleta

### Diagnóstico

**Problema 1 — A Edge Function NÃO foi redeployada.** Os logs mostram que a função `resolveServicePrincipal` nunca é chamada (nenhum log "Resolved SP" ou "Direct SP" aparece). A versão em produção ainda usa o código antigo que faz apenas um tipo de lookup.

**Problema 2 — O `entra_id` pode ser um terceiro tipo de ID.** No Microsoft Graph, existem 3 identificadores:
- **Application Object ID** (`/applications/{id}`)
- **Application Client ID** (`appId`)  
- **Service Principal Object ID** (`/servicePrincipals/{id}`)

A resolução atual tenta SP Object ID e appId, mas ignora Application Object ID. Se os apps foram importados do endpoint `/applications`, o `entra_id` não será encontrado em nenhuma das duas buscas.

### O que será feito

**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

1. Adicionar uma **terceira estratégia de resolução**: buscar via `/applications/{id}` para obter o `appId` real, e então usar esse `appId` para encontrar o Service Principal
2. Adicionar **logging detalhado** em cada etapa de resolução para diagnosticar exatamente o que está falhando
3. **Consumir response bodies** nas falhas para evitar resource leaks no Deno
4. **Redeployar** a Edge Function (desta vez com confirmação de que o deploy foi efetivo)

```text
Resolução em 3 etapas:
1. GET /servicePrincipals/{id} → se 200, é o SP Object ID
2. GET /servicePrincipals?$filter=appId eq '{id}' → se encontra, é o Application Client ID
3. GET /applications/{id} → pega o appId real → GET /servicePrincipals?$filter=appId eq '{appId}'
```

5. Resetar os itens falhados na `iam_queue` para `pending` para reprocessamento

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/process-iam-queue/index.ts` — resolução tripla + logging |
| Deploy | Redeploy forçado da Edge Function |
| SQL | Reset itens `assign_app` falhados para `pending` |

