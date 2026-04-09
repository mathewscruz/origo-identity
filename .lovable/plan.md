

## Plano: Senha padrao no AD + Assunto dos e-mails + Diagnostico da fila

### 1. Senha padrao "Origo@2026er" e troca obrigatoria no AD

Ao criar colaborador ou terceiro, o payload enviado para a `iam_queue` (action_type `create`) nao inclui senha nem flag de troca obrigatoria. Sera adicionado em ambos os fluxos:

**Arquivos a editar:**
- `src/pages/colaboradores/ColaboradoresPage.tsx` — no insert da `iam_queue`, adicionar ao `payload_json`: `password: "Origo@2026er"` e `changePasswordAtLogon: true`
- `src/pages/terceiros/TerceirosPage.tsx` — mesma alteracao

O agente PowerShell que consome essas acoes via `iam-agent-api` ja deve interpretar esses campos ao criar o usuario no AD. O payload sera padronizado para que o agente saiba aplicar `-ChangePasswordAtLogon $true`.

### 2. Alterar assunto de todos os e-mails para "Origo Access & Identity"

Atualmente os assuntos sao como "Nova solicitacao de acesso — Fulano". O prefixo sera padronizado para incluir o nome da ferramenta.

**Arquivos a editar:**
- `supabase/functions/send-notification-email/index.ts` — prefixar todos os `subject` com `[Órigo Access & Identity]`, e trocar mencoes a "Origo Identity" no corpo para "Órigo Access & Identity"
- `supabase/functions/send-review-email/index.ts` — prefixar subject e atualizar footer

Exemplos de assuntos apos a mudanca:
- `[Órigo Access & Identity] Bem-vindo — Nome`
- `[Órigo Access & Identity] Nova solicitação de acesso — Nome`
- `[Órigo Access & Identity] Revisão de Acesso — App`

### 3. Diagnostico e correcao da fila de provisionamento

A analise dos itens pendentes revelou dois problemas distintos:

**Problema A: `create_if_not_exists` nao reconhecido pelo agente AD**
- Varios itens com `action_type: "create_if_not_exists"` estao falhando com erro `action_type invalido: create_if_not_exists`
- O agente AD (`iam-agent-api`) so reconhece `create`, `update`, `disable`, `delete`
- **Correcao:** Na edge function `iam-agent-api`, adicionar `create_if_not_exists` a lista `AD_LOCAL_ACTION_TYPES` e trata-lo como alias de `create` (com logica de verificacao previa se o usuario ja existe)

**Problema B: `assign_app` com `appId` no formato errado**
- Itens `assign_app` falham com "appId ausente no payload"
- O payload usa `app_id` (com underscore, que e o UUID interno do banco), mas a `process-iam-queue` espera `appId` (camelCase, que e o Entra ID/Client ID da aplicacao)
- **Correcao:** Nos fluxos que inserem `assign_app` na `iam_queue` (SolicitacoesPage e PortalSolicitacoesPage), garantir que o campo `appId` contenha o `entra_id` da aplicacao (nao o UUID interno), e que `app_id` (interno) tambem esteja presente para referencia

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — adicionar password e changePasswordAtLogon no payload |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — mesma alteracao |
| Editar | `supabase/functions/send-notification-email/index.ts` — prefixar assuntos com [Órigo Access & Identity] |
| Editar | `supabase/functions/send-review-email/index.ts` — prefixar assunto |
| Editar | `supabase/functions/iam-agent-api/index.ts` — suportar `create_if_not_exists` |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — corrigir payload `assign_app` com `appId` correto |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — mesma correcao |

