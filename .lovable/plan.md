

## Plano: Automacao direta com Entra ID via Microsoft Graph API

### Situacao atual

Hoje o sistema enfileira acoes na `iam_queue` (assign_group, assign_license, etc.) e depende de um agente PowerShell externo para processar. O agente nao suporta os novos action_types e as solicitacoes ficam travadas como `failed`.

Os secrets Azure ja estao configurados: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (usados hoje apenas pelo sync-sharepoint-csv).

### Solucao

Criar uma nova Edge Function `process-iam-queue` que processa automaticamente os itens pendentes da fila, chamando a Microsoft Graph API diretamente -- sem depender do agente PowerShell para operacoes do Entra ID.

```text
iam_queue (pending) → process-iam-queue → Microsoft Graph API → Entra ID
                                        → Atualiza iam_queue (done/failed)
```

O agente PowerShell continua responsavel apenas por operacoes no AD local (create, update, disable, delete). As operacoes Entra ID (assign_group, remove_group, assign_license, remove_license, assign_app, remove_app) passam a ser executadas diretamente pelo backend.

---

### 1. Nova Edge Function: `process-iam-queue`

Fluxo:
1. Obter token Azure via client_credentials (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`)
2. Buscar itens pendentes da `iam_queue` com action_type em `[assign_group, remove_group, assign_license, remove_license, assign_app, remove_app]` e (`next_retry_at IS NULL` ou `next_retry_at <= now()`)
3. Para cada item:
   - Resolver o `objectId` do usuario no Entra ID pelo `userPrincipalName` ou `mail` via Graph API (`GET /users?$filter=...`)
   - Se usuario nao encontrado: marcar como retry (error_code: `user_not_found`, incrementar retry_count)
   - Se encontrado, executar a acao correspondente:

| action_type | Graph API Call |
|---|---|
| assign_group | `POST /groups/{groupId}/members/$ref` com `@odata.id: /directoryObjects/{userId}` |
| remove_group | `DELETE /groups/{groupId}/members/{userId}/$ref` |
| assign_license | `POST /users/{userId}/assignLicense` com `addLicenses: [{skuId}]` |
| remove_license | `POST /users/{userId}/assignLicense` com `removeLicenses: [skuId]` |
| assign_app | `POST /servicePrincipals/{appId}/appRoleAssignedTo` |
| remove_app | `DELETE /servicePrincipals/{appId}/appRoleAssignedTo/{assignmentId}` |

4. Atualizar `iam_queue`: status=done, processed_at, processed_by="lovable_cloud", result_message
5. Tratar erros 404 (usuario/grupo nao encontrado) com retry automatico

Seguranca: validar token IAM_AGENT_TOKEN ou permitir chamada interna (via cron).

### 2. Novo action_type: assign_app / remove_app

Hoje o sistema tem `perfil_aplicacoes` que vincula perfis a aplicacoes, mas a tabela `aplicacoes` ja possui o campo `entra_id` (ID do Service Principal no Entra ID). Falta:

- Adicionar coluna `default_app_role_id` na tabela `aplicacoes` (para o ID do appRole a ser atribuido; default: `00000000-0000-0000-0000-000000000000` que e o "Default Access")
- Ajustar `provisionCargoAcessos` e as funcoes `queueProfileAccess` (em sync-csv-colab e sync-sharepoint-csv) para tambem gerar `assign_app`/`remove_app` quando o perfil tem aplicacoes com `entra_id` preenchido

### 3. Ajustar `iam-agent-api` GET /pending

Filtrar para retornar ao agente PowerShell APENAS action_types de AD local: `create`, `create_if_not_exists`, `update`, `disable`, `delete`. As acoes Entra ID serao processadas pela nova function.

### 4. Cron job para processamento automatico

Criar um cron job (via pg_cron, ja habilitado) que chama `process-iam-queue` a cada 5 minutos, garantindo processamento continuo sem intervencao manual.

### 5. Botao manual na interface

Adicionar botao "Processar Fila Entra ID" na pagina de Fila de Provisionamento para execucao manual quando necessario.

---

### Permissoes necessarias no App Registration Azure

O App Registration usado (`AZURE_CLIENT_ID`) precisa das seguintes permissoes Application (nao Delegated):

- `Group.ReadWrite.All` — gerenciar membros de grupos
- `User.ReadWrite.All` — atribuir licencas
- `Application.ReadWrite.All` — gerenciar app role assignments
- `Directory.Read.All` — buscar usuarios

Essas permissoes devem ser concedidas com **Admin Consent** no portal Azure.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/process-iam-queue/index.ts` — processador automatico via Graph API |
| Migracao | Adicionar `default_app_role_id` em `aplicacoes`; cron job a cada 5min |
| Editar | `supabase/functions/iam-agent-api/index.ts` — filtrar GET /pending so para AD local |
| Editar | `src/lib/provisionCargoAcessos.ts` — gerar assign_app/remove_app |
| Editar | `supabase/functions/sync-csv-colab/index.ts` — gerar assign_app/remove_app |
| Editar | `supabase/functions/sync-sharepoint-csv/index.ts` — gerar assign_app/remove_app |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — botao processar + novos action_types |
| Editar | `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` — novos action_types |
| Editar | `supabase/config.toml` — registrar nova function |

