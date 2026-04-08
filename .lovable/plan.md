

## Plano: Corrigir reset de senha administrativo

### Problema
A funcionalidade de trocar senha na pagina de Usuarios usa `supabase.auth.updateUser({ password })`, que so altera a senha do usuario **logado**. Ou seja, quando o admin clica em "Trocar Senha" de outro usuario, na verdade muda a propria senha.

### Solucao
Criar uma acao `update_password` na edge function `admin-create-user` (ou criar uma nova function) que usa `adminClient.auth.admin.updateUserById()` com o service role key para alterar a senha de qualquer usuario.

### Alteracoes

**1. Editar `supabase/functions/admin-create-user/index.ts`**
- Adicionar suporte a uma acao `action: "reset_password"` no body
- Quando `action === "reset_password"`, receber `user_id` e `password`
- Usar `adminClient.auth.admin.updateUserById(user_id, { password })` para forcar a nova senha
- Manter a logica existente de criacao de usuario quando nao houver `action` ou `action === "create"`

**2. Editar `src/pages/admin/UsuariosPage.tsx`**
- No handler de troca de senha (linha ~260-266), trocar `supabase.auth.updateUser` por uma chamada a edge function com `action: "reset_password"`, passando `user_id: changingPwd` e `password: newPwd`
- Usar o mesmo padrao de fetch ja usado no `handleSave` para criacao

### Resultado
- Admin consegue redefinir a senha de qualquer usuario do sistema
- A senha e alterada via service role key no backend, sem depender da sessao do usuario alvo

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/admin-create-user/index.ts` — adicionar acao reset_password |
| Editar | `src/pages/admin/UsuariosPage.tsx` — chamar edge function no reset de senha |

