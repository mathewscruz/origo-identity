

## Plano: E-mail de boas-vindas para admins + troca de senha no primeiro login + padronizar visual dos e-mails

### O que sera feito

**1. E-mail de boas-vindas ao criar usuario admin/operador/viewer**

Ao criar um usuario na pagina `UsuariosPage`, apos sucesso da edge function `admin-create-user`, enviar e-mail de boas-vindas via `send-notification-email` com:
- Nome do usuario
- Email de acesso
- Senha temporaria (a mesma definida no cadastro)
- Link para acessar o sistema
- Aviso de que devera trocar a senha no primeiro acesso

**2. Flag `must_change_password` no perfil**

- Adicionar coluna `must_change_password boolean DEFAULT true` na tabela `profiles`
- Quando o admin cria um usuario, o campo fica `true`
- Apos o usuario trocar a senha, o campo vai para `false`

**3. Dialog de troca obrigatoria de senha no primeiro login**

- No `AuthContext`, apos carregar o profile, expor `mustChangePassword`
- Criar componente `ForcePasswordChangeDialog` — dialog modal nao-dismissivel que aparece quando `must_change_password = true`
- O usuario informa nova senha (minimo 6 chars) + confirmacao
- Ao salvar: chama `supabase.auth.updateUser({ password })` e atualiza `profiles.must_change_password = false`
- Colocar o dialog no `AppLayout` (painel admin) e no `PortalLayout` (portal)

**4. Novo tipo de e-mail `usuario_boas_vindas` na edge function**

Adicionar ao `send-notification-email`:
- Tipo: `usuario_boas_vindas`
- Payload: `{ destinatario_email, nome, email, senha, role, link }`
- Template com dados de acesso, senha temporaria e instrucao de troca

**5. Padronizar visual de TODOS os e-mails com a marca Origo**

O tema da aplicacao usa cor primaria teal/verde (`hsl(176, 74%, 34%)` = ~`#0e9384`), mas os e-mails atuais usam gradientes roxos (`#7c3aed`, `#667eea → #764ba2`) que nao correspondem a identidade visual. Ajustes:

- **Header**: manter gradiente escuro `#1a1f2c → #2d3748` (ok, combina com sidebar)
- **Botoes de acao**: trocar de roxo para teal/verde da marca (`#0e9384` → `#0d8276`)
- **Emoji no header**: remover o emoji "🔐" e usar texto limpo "Origo Identity"
- **send-review-email**: trocar gradiente do botao de `#667eea → #764ba2` para `#0e9384 → #0d8276`
- **send-notification-email**: trocar `#7c3aed → #6d28d9` para `#0e9384 → #0d8276`

### Migracao de banco

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
-- Marcar usuarios existentes como ja tendo trocado (nao forcar para quem ja usa)
UPDATE public.profiles SET must_change_password = false;
```

### Arquivos

| Acao | Arquivo |
|---|---|
| Migrar | Adicionar coluna `must_change_password` em `profiles` |
| Criar | `src/components/ForcePasswordChangeDialog.tsx` — dialog modal de troca obrigatoria |
| Editar | `src/contexts/AuthContext.tsx` — expor `mustChangePassword` do profile |
| Editar | `src/components/AppLayout.tsx` — renderizar `ForcePasswordChangeDialog` |
| Editar | `src/pages/portal/PortalLayout.tsx` — renderizar `ForcePasswordChangeDialog` |
| Editar | `supabase/functions/send-notification-email/index.ts` — adicionar tipo `usuario_boas_vindas` + corrigir cor dos botoes |
| Editar | `supabase/functions/send-review-email/index.ts` — corrigir cor do botao para teal |
| Editar | `src/pages/admin/UsuariosPage.tsx` — enviar e-mail de boas-vindas apos criar usuario |
| Editar | `supabase/functions/admin-create-user/index.ts` — setar `must_change_password = true` no profile apos criacao |

