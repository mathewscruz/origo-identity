

## Plano: Adicionar campo de senha e auto-confirmação na criação de usuário

### Alterações

**1. Edge Function `admin-create-user/index.ts`:**
- Trocar `inviteUserByEmail` por `admin.createUser()` com `email_confirm: true` (auto-confirma o e-mail)
- Aceitar campo `password` no body (obrigatório, mínimo 6 caracteres)
- O usuário poderá logar imediatamente com email + senha definida pelo admin

**2. Frontend `UsuariosPage.tsx`:**
- Adicionar campo `senha` ao state do form (apenas para criação, não edição)
- Adicionar `<Input type="password">` no dialog de novo usuário
- Validar mínimo 6 caracteres antes de enviar
- Enviar `password` no payload da edge function
- Atualizar mensagem de sucesso para "Usuário criado com sucesso"

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/admin-create-user/index.ts` — `createUser` com `email_confirm: true` + senha |
| Editar | `src/pages/admin/UsuariosPage.tsx` — campo senha no form de criação |

