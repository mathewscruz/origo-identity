

## Analise: Fluxo de Convite de Usuarios Administradores

### Problema critico encontrado

O fluxo atual de criacao de usuarios tem um **bug grave** que impede o uso em producao:

**`supabase.auth.signUp()` chamado do client-side desloga o admin atual.** Quando o admin cria um novo usuario via `signUp`, o Supabase automaticamente inicia uma sessao para o novo usuario, substituindo a sessao do admin logado. Isso causa:

1. O admin e deslogado imediatamente apos criar o usuario
2. O insert na tabela `user_roles` (linha 80) pode falhar porque a sessao agora pertence ao novo usuario, que nao tem role `admin`
3. O novo usuario fica sem role atribuida

### Correcao

Criar uma **Edge Function `admin-create-user`** que usa o `service_role_key` server-side para:

1. Criar o usuario via `supabase.auth.admin.createUser()` (nao afeta a sessao do admin)
2. Inserir o role na tabela `user_roles` 
3. Opcionalmente enviar email de convite com link de redefinicao de senha

**No frontend (`UsuariosPage.tsx`):** Substituir o `signUp` pelo fetch para a edge function.

### Fluxo corrigido

```text
Admin clica "Novo Usuario"
  → Frontend envia { email, nome, role, password } para edge function
  → Edge function usa admin.createUser() (service_role)
  → Edge function insere role em user_roles
  → Retorna sucesso
  → Admin permanece logado
  → Novo usuario recebe email de confirmacao
```

### Arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/admin-create-user/index.ts` — edge function com createUser + role insert |
| Editar | `src/pages/admin/UsuariosPage.tsx` — substituir signUp por fetch na edge function |

