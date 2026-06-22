## Diagnóstico do fluxo "Novo Usuário" (Configurações → Usuários)

Fluxo atual revisado:

1. `UsuariosPage` → POST para `admin-create-user` (email, nome, role, password).
2. `admin-create-user` valida JWT + role `admin`, cria usuário em `auth.users` com `email_confirm: true` e insere em `user_roles`. O trigger `handle_new_user` cria a linha em `profiles`.
3. De volta no cliente, `sendNotificationEmail("usuario_boas_vindas", …)` chama `send-notification-email`, que monta o template HTML (logo Órigo, dados, senha temporária) e envia via SendGrid (`SENDGRID_API_KEY` já configurada).
4. Auditoria do envio é gravada em `auditoria`.

### O que funciona

- Criação do usuário, role e profile.
- Template `usuario_boas_vindas` existe, é bonito, mostra e-mail/senha/perfil e CTA "Acessar o Sistema".
- SendGrid configurado e `requireRole(["admin","operador"])` protege o endpoint.
- Reset de senha pelo admin funciona (chama `admin-create-user` com `action=reset_password`).

### Gaps reais (precisam ser corrigidos)

1. **A promessa do e-mail não se cumpre.** O template diz "você será solicitado a alterar a senha temporária no primeiro login", mas `admin-create-user` nunca seta `profiles.must_change_password = true`. Resultado: o `ForcePasswordChangeDialog` (já existente em `AppLayout` e `PortalLayout`) não dispara — o usuário entra com a senha temporária e segue usando ela indefinidamente.

2. **Envio de e-mail depende do cliente.** A chamada a `sendNotificationEmail` é feita pelo navegador depois do `admin-create-user` retornar. Se a aba fechar, a rede cair ou o admin sair da página, o usuário é criado mas nunca recebe credenciais. Não há retry nem rastreio de falha visível ao admin (somente log silencioso).

3. **Reset de senha não notifica o usuário.** Quando o admin troca a senha pelo ícone de chave, nada é enviado por e-mail e `must_change_password` continua `false` — o usuário fica sem saber que a senha mudou.

4. **Tipagem solta.** Em `UsuariosPage.tsx` o tipo `"usuario_boas_vindas"` é forçado com `as any` porque não consta em `NotificationType` no `sendNotificationEmail.ts`.

5. **Política de senha fraca.** Mínimo de 6 caracteres e sem checagem HIBP. A configuração de auth pode habilitar `password_hibp_enabled` para reduzir uso de senhas vazadas (mantendo o mesmo fluxo).

## Plano de correção

### 1. `admin-create-user` (Edge Function)
- Após criar o usuário, fazer `update` em `public.profiles` com `must_change_password: true` (usando service role).
- **Mover o envio do e-mail de boas-vindas para dentro da função**, logo após o sucesso do `createUser`. Reaproveitar `_shared/sendgrid.ts` chamando o `send-notification-email` internamente ou inline. Garante envio mesmo se o cliente fechar.
- No branch `action=reset_password`:
  - Setar `must_change_password: true` no profile do alvo.
  - Disparar e-mail de "senha redefinida pelo administrador" (novo tipo `usuario_senha_redefinida`) com a nova senha temporária e aviso para troca no próximo login.
- Retornar no JSON `{ email_enviado: true/false, email_erro?: string }` para o cliente exibir feedback.

### 2. `send-notification-email` (Edge Function)
- Adicionar novo tipo `usuario_senha_redefinida` (template reaproveitando layout `baseLayout`, com nova senha + aviso de troca obrigatória).
- Permitir invocação interna (sem JWT de admin) usando service-role header, **ou** continuar exigindo JWT e chamar a função a partir do `admin-create-user` repassando o `Authorization` original — caminho mais simples e mantém auditoria.

### 3. Cliente `src/pages/admin/UsuariosPage.tsx`
- Remover a chamada manual ao `sendNotificationEmail` (passa a ser feita pelo backend).
- No retorno do `admin-create-user`, exibir toast detalhado: "Usuário criado e e-mail enviado para X" ou aviso visível em vermelho se `email_enviado=false`.
- Mesma coisa no reset de senha: mostrar se o e-mail foi enviado.

### 4. `src/lib/sendNotificationEmail.ts`
- Adicionar `"usuario_boas_vindas"` e `"usuario_senha_redefinida"` em `NotificationType` para remover o `as any`.

### 5. Segurança de senhas
- Chamar `configure_auth` para habilitar `password_hibp_enabled: true` (mantém `disable_signup: true`, sem auto-confirm, sem anônimos — preferências já registradas).
- Subir o mínimo do form para 8 caracteres (UI + validação no edge function).

### 6. Validação manual após implementação
- Criar usuário de teste pela UI → conferir caixa de entrada (template chega), logar com a senha temporária → o `ForcePasswordChangeDialog` deve aparecer e bloquear até trocar.
- Resetar senha pelo ícone de chave → conferir e-mail e que o próximo login exige nova troca.
- Conferir entradas em `auditoria` (`criar_usuario`, `enviar_email`, `resetar_senha`).

### Arquivos afetados
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/send-notification-email/index.ts`
- `src/pages/admin/UsuariosPage.tsx`
- `src/lib/sendNotificationEmail.ts`
- Auth config (via tool `configure_auth`)

Nenhuma migration de schema é necessária — `profiles.must_change_password` já existe.