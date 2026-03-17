

## Plano: Integração Microsoft Entra ID via Microsoft Graph API

### Visão Geral
Criar uma edge function que usa Client Credentials (client_id + client_secret + tenant_id) para autenticar no Microsoft Graph API e importar **usuários** e **enterprise applications** do Entra ID para as tabelas `colaboradores` e `aplicacoes` do Órigo.

### Secrets Necessários
Solicitar ao usuário via `add_secret`:
1. **AZURE_TENANT_ID** — Tenant ID do Azure AD
2. **AZURE_CLIENT_ID** — Application (client) ID do App Registration
3. **AZURE_CLIENT_SECRET** — Client secret do App Registration

O App Registration precisa das permissões Microsoft Graph (Application): `User.Read.All`, `Application.Read.All`, `Directory.Read.All`.

### Edge Function: `sync-entra-id`

**Autenticação**: POST para `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` com `client_credentials` grant.

**Endpoints Graph API**:
- `GET /users?$select=id,displayName,mail,jobTitle,department,employeeId,accountEnabled` — mapeia para `colaboradores`
- `GET /applications?$select=id,displayName,signInAudience,tags` — mapeia para `aplicacoes`

**Mapeamento de dados**:

| Graph User field | Coluna colaboradores |
|---|---|
| displayName | nome |
| mail | email |
| employeeId | matricula |
| jobTitle | (match com cargos.nome) |
| department | (match com areas.nome) |
| accountEnabled | status (ativo/inativo) |

| Graph Application field | Coluna aplicacoes |
|---|---|
| displayName | nome |
| signInAudience | tipo_auth |
| (default) | criticidade: media |

**Lógica de upsert**: Adicionar coluna `entra_id` (text, nullable, unique) nas tabelas `colaboradores` e `aplicacoes` via migration para tracking do ID externo. O sync faz upsert pelo `entra_id`.

**Paginação**: Graph API retorna `@odata.nextLink` — seguir até não ter mais páginas.

### Migration SQL
- `ALTER TABLE colaboradores ADD COLUMN entra_id text UNIQUE`
- `ALTER TABLE aplicacoes ADD COLUMN entra_id text UNIQUE`

### Frontend
- Botão "Sincronizar Entra ID" no Dashboard ou em Configurações
- Chama `supabase.functions.invoke('sync-entra-id')`
- Mostra progresso/resultado (quantidade importada/atualizada)
- Possibilidade de agendar sync periódico futuramente

### Etapas de Implementação
1. Solicitar os 3 secrets (tenant, client_id, client_secret)
2. Migration para adicionar `entra_id` nas tabelas
3. Criar edge function `sync-entra-id/index.ts` com CORS, autenticação OAuth2, paginação Graph API, e upsert via service role key
4. Atualizar `config.toml` com `verify_jwt = false` para a function
5. Adicionar UI de importação (botão + feedback) em Configurações ou Dashboard

