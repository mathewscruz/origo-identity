

## Plano: 5 ajustes no sistema

### 1. Transição visual suave entre telas

Adicionar animação de fade-in no container principal (`<Outlet />`) do `AppLayout.tsx`. Usar a classe `animate-fade-in` já existente no Tailwind config para que toda troca de rota tenha uma transição suave.

### 2. Campo de busca em Áreas e Cargos

**AreasPage.tsx:** Adicionar state `busca` e um `Input` com ícone `Search` acima da tabela. Filtrar a lista por `nome` antes da paginação.

**CargosPage.tsx:** Mesmo padrão — state `busca`, input com `Search`, filtro por nome.

### 3. Remover coluna "Criticidade" da tabela de Aplicações

**AplicacoesPage.tsx:**
- Remover o `<th>` de "Criticidade" (linha 203)
- Remover o `<td>` com o Badge de criticidade (linha 222)
- Manter o filtro de criticidade e os cards de estatísticas (são úteis), remover apenas a coluna da tabela

### 4. Convite por e-mail ao criar usuário

Atualmente a Edge Function `admin-create-user` usa `email_confirm: true`, o que auto-confirma o usuário sem enviar nenhum e-mail. O usuário recebe a senha definida pelo admin.

**Correção:** Alterar para usar `adminClient.auth.admin.inviteUserByEmail()` em vez de `createUser`. Isso envia automaticamente um e-mail de convite com link para definir senha. Remover o campo "senha" do formulário no frontend, já que o usuário definirá a própria senha pelo link.

**admin-create-user/index.ts:**
- Substituir `createUser` por `inviteUserByEmail(email, { data: { nome }, redirectTo: APP_URL })`
- Remover validação de `password`

**UsuariosPage.tsx:**
- Remover campo "Senha" do dialog de criação
- Atualizar payload para não enviar `password`

### 5. Remover Motor de Regras

**App.tsx:** Remover imports de `RegrasPage` e `RegraEditorPage`, e as 3 rotas `/regras*`.

**AppSidebar.tsx:** Remover o item `{ title: "Motor de Regras", url: "/regras", icon: Cog }` do grupo "Controle".

**AppLayout.tsx:** Remover as entradas `/regras` e `/regras/nova` do `routeLabels`.

Os arquivos `src/pages/regras/RegrasPage.tsx` e `src/pages/regras/RegraEditorPage.tsx` ficam no repositório mas inacessíveis (sem rota).

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/components/AppLayout.tsx` — animação fade-in no Outlet + remover labels regras |
| Editar | `src/pages/configuracoes/AreasPage.tsx` — campo de busca |
| Editar | `src/pages/configuracoes/CargosPage.tsx` — campo de busca |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — remover coluna Criticidade |
| Editar | `supabase/functions/admin-create-user/index.ts` — trocar createUser por inviteUserByEmail |
| Editar | `src/pages/admin/UsuariosPage.tsx` — remover campo senha |
| Editar | `src/App.tsx` — remover rotas regras |
| Editar | `src/components/AppSidebar.tsx` — remover item Motor de Regras |

