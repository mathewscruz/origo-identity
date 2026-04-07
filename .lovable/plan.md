

## Plano: Aprimorar o módulo de Aplicações

### 1. Botão de Sync com Azure (Service Principals + App Registrations)

**Nova Edge Function:** `supabase/functions/sync-entra-apps/index.ts`
- Buscar Service Principals via `GET /servicePrincipals?$filter=tags/any(t: t eq 'WindowsAzureActiveDirectoryIntegratedApp')&$select=id,displayName,appId,servicePrincipalType,appOwnerOrganizationId`
- Buscar App Registrations via `GET /applications?$select=id,appId,displayName`
- Upsert na tabela `aplicacoes` usando `entra_id` como chave de conflito, evitando duplicatas
- Definir `integracao_ativa = true` e `tipo_auth = 'SSO'` para apps vindos do Azure

**Config:** Adicionar `[functions.sync-entra-apps] verify_jwt = false` ao `supabase/config.toml`

**UI:** Botão com icone `RefreshCw` ao lado de "Nova Aplicação" em `AplicacoesPage.tsx`. Ao clicar, invoca a Edge Function e mostra toast com resultado (X apps sincronizados, Y novos).

### 2. Deduplicação

A Edge Function usará upsert com `onConflict: "entra_id"`. Para apps sem `entra_id` (manuais), a deduplicação será por nome antes do insert — se já existe um app com mesmo nome e sem `entra_id`, atualiza o `entra_id` nele em vez de criar duplicata.

### 3. Owner já existe — validar UX

O campo Owner já existe na tabela e no formulário de edição. Melhorias:
- Na listagem, tornar o nome da aplicação clicável (link para página de detalhe)
- Mostrar o Owner na listagem (já aparece, OK)

### 4. Página de Detalhe da Aplicação (nova)

**Novo arquivo:** `src/pages/aplicacoes/AplicacaoDetalhePage.tsx`

Substituir o `PlaceholderPage` na rota `/aplicacoes/:id`.

Conteúdo:
- **Header:** Nome, criticidade (badge), tipo auth, owner, entra_id, switches de aprovação e integração, botão editar
- **Aba "Usuários Atribuídos":** Lista de colaboradores que possuem essa app via seus perfis. Query: `perfil_aplicacoes` → `cargo_perfis` → `colaboradores` filtrados por cargo_id
- **Aba "Grupos Atribuídos":** Lista de perfis que incluem essa app, com seus grupos associados
- **Aba "Perfis":** Lista de perfis de acesso que incluem essa aplicação (via `perfil_aplicacoes`)

### 5. Suporte a aplicações externas (fora do SSO Azure)

Já é possível cadastrar apps manuais. Melhorias:
- Adicionar campo `url` na tabela `aplicacoes` (migration) para armazenar URL de acesso da app externa
- Adicionar campo `origem` (`azure` | `manual`) para distinguir apps importados de manuais
- No formulário, mostrar campo URL quando a app não tem `entra_id`
- Na listagem, badge visual diferenciando "Azure SSO" de "Externa/Manual"

### 6. Melhorias de UX/UI

- **Filtros:** Adicionar filtros por criticidade, integração ativa/inativa, e origem (Azure/Manual)
- **Contadores no header:** Cards com totais (Total, Ativas, Críticas, Sem Owner)
- **Tooltip no icone de aprovação:** Mostrar "Requer aprovação para concessão"
- **Nome clicável:** Link para a página de detalhe
- **Empty state:** Mensagem quando não há apps com botão de sync

### Arquivos a criar/alterar

| Ação | Arquivo |
|---|---|
| Criar | `supabase/functions/sync-entra-apps/index.ts` |
| Editar | `supabase/config.toml` — adicionar bloco da nova function |
| Criar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — botão sync, filtros, contadores, link para detalhe |
| Editar | `src/App.tsx` — trocar PlaceholderPage pela nova página de detalhe |
| Migration | Adicionar colunas `url` e `origem` na tabela `aplicacoes` |

### Ordem de implementação

1. Migration (colunas `url`, `origem`)
2. Edge Function `sync-entra-apps`
3. Atualizar `AplicacoesPage` (botão sync, filtros, contadores, links)
4. Criar `AplicacaoDetalhePage`
5. Atualizar rota no `App.tsx`

