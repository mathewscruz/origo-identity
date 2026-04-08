

## Plano: Adicionar suporte OAuth 2.0 Client Credentials ao framework de conectores

### Situação atual

O framework de conectores já suporta autenticação por:
- Bearer token
- Basic auth (usuário/senha)
- API key (header customizado)
- App token (padrão GLPI)

Falta suporte a **OAuth 2.0 Client Credentials**, necessário para SAP, Salesforce, Google Workspace e outros.

### Alteração

**1. Ampliar `connector_config` com campos OAuth 2.0:**
- Adicionar `auth_type: "oauth2_client_credentials"` como opção
- Novos campos no config: `token_url`, `client_id`, `client_secret`, `scope` (opcional)
- O sistema faz POST ao `token_url` para obter um `access_token` antes de cada chamada

**2. Atualizar edge functions (`sync-app-profiles` e `process-iam-queue`):**
- Adicionar função `getOAuth2Token(config)` que faz o fluxo client_credentials
- Usar o token obtido como Bearer nas chamadas subsequentes

**3. Atualizar UI do conector (`AplicacaoDetalhePage.tsx`):**
- Quando `auth_type === "oauth2_client_credentials"`, exibir campos: Token URL, Client ID, Client Secret, Scope
- Botão "Testar Conexão" deve validar obtendo um token

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-app-profiles/index.ts` — adicionar `getOAuth2Token()` e case `oauth2_client_credentials` |
| Editar | `supabase/functions/process-iam-queue/index.ts` — mesma função OAuth no dispatcher genérico |
| Editar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` — campos OAuth 2.0 na aba Conector |

