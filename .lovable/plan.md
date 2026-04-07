

## Plano: Corrigir resolução de Service Principal para apps

### Causa raiz

O campo `entra_id` na tabela `aplicacoes` armazena o **Object ID do Service Principal** (como vem da sincronização do Entra ID), mas a Edge Function trata esse valor como **Application (client) ID** e tenta resolvê-lo com `$filter=appId eq '...'`, que não retorna resultados.

A correção é usar uma estratégia de resolução dupla:
1. Primeiro, tentar usar o `entra_id` diretamente como Object ID do Service Principal (verificando com `GET /servicePrincipals/{id}`)
2. Se falhar, fazer fallback para `$filter=appId eq '...'` (caso algum app tenha o client ID)

### Alteração

**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

No `assign_app` e `remove_app`, substituir a lógica de resolução:

```text
Antes:
  GET /servicePrincipals?$filter=appId eq '{id}' → não encontra → falha

Depois:
  GET /servicePrincipals/{id} → se 200, usar diretamente como SP Object ID
  senão → GET /servicePrincipals?$filter=appId eq '{id}' → fallback
```

Isso cobre os dois cenários: apps importados (cujo `entra_id` é o Object ID do SP) e apps cadastrados manualmente (cujo `entra_id` pode ser o Application client ID).

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/process-iam-queue/index.ts` — resolução dupla do SP ID |
| Deploy | Redeploy da Edge Function |

