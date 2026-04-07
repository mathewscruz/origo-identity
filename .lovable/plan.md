

## Plano: Módulo de Acessos Privilegiados (PAM)

### Objetivo

Criar um módulo que sincroniza as Directory Roles (funções administrativas) do Microsoft Entra ID e lista todos os usuários com acessos privilegiados, replicando a visão "Funções e administradores" do Azure portal.

### Abordagem

**Edge Function `sync-entra-roles`:** Usa a Microsoft Graph API para buscar todas as directory roles ativas e seus membros:
- `GET /directoryRoles` — lista roles ativas no tenant
- `GET /directoryRoles/{id}/members` — lista membros de cada role
- Cruza membros com a tabela `colaboradores` (por `entra_id` ou `email`) para vincular identidades

**Migration — duas tabelas:**
- `entra_roles`: `id`, `role_id` (entra), `nome`, `descricao`, `is_privileged`, `template_id`, `updated_at`
- `entra_role_members`: `id`, `role_id` (FK entra_roles), `user_entra_id`, `user_display_name`, `user_email`, `colaborador_id` (FK nullable), `updated_at`

**Página `PrivilegiadosPage.tsx`:**
- Header com contadores: Total de roles, Privilegiadas, Total de atribuições, Usuários únicos
- Busca por nome de role ou descrição
- Tabela com colunas: Função, Descrição, Privilegiado (badge), Atribuições (contagem), Tipo
- Clicar numa role expande/abre dialog mostrando todos os membros com link para o colaborador quando vinculado
- Botão "Sincronizar com Entra ID" para disparar a Edge Function
- Filtro por "Apenas privilegiadas"

**Detecção de privilegiado:** A Graph API retorna `isBuiltIn` e o `roleTemplateId`. Roles como Global Administrator, Privileged Role Administrator, etc. são marcadas automaticamente como privilegiadas baseado numa lista conhecida de `roleTemplateId` de alto risco.

**Alertas:** Ao sincronizar, gerar alertas para:
- Roles privilegiadas com mais de N membros (ex: Global Admin com >3 membros)
- Membros privilegiados que não estão vinculados a nenhum colaborador ativo

### Integração com sidebar e rotas

- Adicionar "Privilegiados" no grupo "Governança" com ícone `Crown`
- Rota `/privilegiados`

### Arquivos

| Ação | Arquivo |
|---|---|
| Migration | Criar tabelas `entra_roles` e `entra_role_members` com RLS |
| Criar | `supabase/functions/sync-entra-roles/index.ts` — sync via Graph API |
| Criar | `src/pages/privilegiados/PrivilegiadosPage.tsx` — listagem e detalhes |
| Editar | `src/App.tsx` — rota `/privilegiados` |
| Editar | `src/components/AppSidebar.tsx` — item no grupo Governança |
| Editar | `src/components/AppLayout.tsx` — breadcrumb label |

