

## Diagnóstico: Por que apps e licenças falharam

### Problema 1 — Apps: ID errado (Application ID vs Service Principal ID)

O erro nos apps é:
```
Resource '076fee36-44b2-4910-9cb4-e4ebbda42d4e' does not exist
Resource '5e000ec0-fc29-4e13-98d4-104b18d0ba22' does not exist
```

A Edge Function usa o endpoint `POST /servicePrincipals/{appId}/appRoleAssignedTo`. Esse endpoint exige o **Object ID do Service Principal**, mas o campo `entra_id` na tabela `aplicacoes` contém o **Application (client) ID** — que é um identificador diferente no Entra ID.

Para corrigir, a Edge Function precisa resolver o Service Principal a partir do Application ID antes de atribuir o role:
```
GET /servicePrincipals?$filter=appId eq '{applicationId}'
```
Isso retorna o Object ID do Service Principal correto, que então é usado no endpoint de assignment.

### Problema 2 — Licença: usageLocation não definido

O erro na licença é:
```
License assignment cannot be done for user with invalid usage location.
```

O usuário "Teste IAM 7" não tem o campo `usageLocation` definido no Entra ID. O Microsoft Graph exige que esse campo esteja preenchido (ex: "BR") antes de atribuir qualquer licença. A correção é definir o `usageLocation` automaticamente antes de atribuir licenças.

### O que será ajustado

**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

#### Correção 1 — Resolver Service Principal pelo appId
No case `assign_app`, antes de chamar o endpoint de assignment:
1. Fazer `GET /servicePrincipals?$filter=appId eq '{entraId}'` para obter o `id` do Service Principal
2. Usar esse `id` no endpoint `POST /servicePrincipals/{spId}/appRoleAssignedTo`
3. Aplicar a mesma lógica no `remove_app`

#### Correção 2 — Definir usageLocation antes de atribuir licença
No case `assign_license`, antes de atribuir:
1. Fazer `GET /users/{userId}?$select=usageLocation` para verificar se já está definido
2. Se não estiver, fazer `PATCH /users/{userId}` com `{ "usageLocation": "BR" }`
3. Então prosseguir com a atribuição da licença

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/process-iam-queue/index.ts` — resolver SP por appId + definir usageLocation |

