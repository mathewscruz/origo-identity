

## Plano: Remover "Operadores" (redundante com "Usuários")

### Diagnóstico

Os dois módulos fazem essencialmente a mesma coisa — gerenciar quem opera o sistema:

| | Operadores (Configurações) | Usuários (Admin) |
|---|---|---|
| Tabela | `operadores` (nome, email, ativo) | `profiles` + `user_roles` (nome, email, ativo, role) |
| Vinculado a auth | Não | Sim (auth.users) |
| Controle de permissão | Nenhum | admin/operador/viewer |
| Criação de conta | Não | Sim (via edge function) |
| Troca de senha | Não | Sim |

**Conclusão:** "Operadores" é uma tabela legada que não está vinculada à autenticação. Toda a gestão real de acesso ao sistema já é feita em "Usuários". Manter os dois causa confusão e dados duplicados.

A única referência funcional à tabela `operadores` é em `IntegracoesPage.tsx` (linha 105), onde emails de operadores são usados como lista de proteção durante limpeza de colaboradores. Isso pode ser migrado para usar `profiles` no lugar.

### Alterações

**1. Remover página e rota de Operadores:**
- Remover `src/pages/configuracoes/OperadoresPage.tsx`
- Remover import e rota em `src/App.tsx`
- Remover link "Operadores" do sub-nav em `ConfiguracoesLayout.tsx`
- Remover referência no breadcrumb em `AppLayout.tsx`

**2. Migrar referência em IntegracoesPage.tsx:**
- Linha 105: trocar `supabase.from("operadores").select("email")` por `supabase.from("profiles").select("email")` para proteger emails de usuários do sistema durante limpeza

**3. Remover hook `useOperadores`:**
- Remover de `src/hooks/useOrigoData.ts`

### Arquivos

| Ação | Arquivo |
|---|---|
| Remover | `src/pages/configuracoes/OperadoresPage.tsx` |
| Editar | `src/App.tsx` — remover import e rota de Operadores |
| Editar | `src/pages/configuracoes/ConfiguracoesLayout.tsx` — remover link "Operadores" do menu |
| Editar | `src/components/AppLayout.tsx` — remover breadcrumb de operadores |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` — usar `profiles` em vez de `operadores` |
| Editar | `src/hooks/useOrigoData.ts` — remover `useOperadores` |

