

## Plano: Configurar e-mails de autenticação com branding do Órigo

### Estado atual

- **Nenhum domínio de e-mail configurado.** O sistema está usando os e-mails padrão do Lovable (sem branding, sem logo, em inglês).
- **Não existe `auth-email-hook`** — nenhum template personalizado foi criado ainda.
- **O logo está em** `src/assets/logo.png` (o mesmo usado no sidebar).

### O que precisa ser feito

#### Passo 1 — Configurar domínio de e-mail
A configuração de domínio de e-mail requer permissões de administrador do workspace. Você precisará abrir as configurações de e-mail no Lovable Cloud para adicionar um domínio (ex: `origo-identity.com` ou subdomínio como `notify.origo-identity.com`), e configurar os registros DNS necessários.

#### Passo 2 — Scaffoldar templates de e-mail de autenticação
Depois do domínio configurado, usarei a ferramenta `scaffold_auth_email_templates` para criar todos os templates:
- **Confirmação de cadastro** (signup)
- **Redefinição de senha** (recovery)
- **Magic link** (magiclink)
- **Convite** (invite)
- **Troca de e-mail** (email-change)
- **Reautenticação** (reauthentication)

#### Passo 3 — Aplicar branding do Órigo

Extraído do `index.css`:
- **Primary:** `hsl(221, 83%, 53%)` (azul corporativo)
- **Primary foreground:** `hsl(0, 0%, 100%)` (branco)
- **Foreground:** `hsl(222, 47%, 11%)` (escuro)
- **Muted foreground:** `hsl(215, 16%, 47%)`
- **Border radius:** `0.5rem`

Cada template receberá:
- Logo do Órigo (`src/assets/logo.png`) no topo, carregado via Storage bucket `email-assets`
- Cores do tema corporativo em botões, títulos e textos
- **Textos em português**, alinhados com o tom do sistema ("Entrar no Órigo", "Redefinir Senha", etc.)
- Terminologia consistente: "sistema", "acesso", "conta"

#### Passo 4 — Deploy do `auth-email-hook`
Deploy automático da Edge Function que roteia os e-mails de autenticação.

#### Passo 5 — Validar o `send-review-email`
A função `send-review-email` já existe mas apenas **loga** o e-mail (não envia de fato). Após o domínio estar verificado, posso integrá-la ao sistema de e-mail transacional do Lovable para enviar e-mails de revisão reais.

### Pré-requisito

Antes de eu executar os passos 2-5, **o domínio de e-mail precisa estar configurado**. Você pode fazer isso acessando as configurações do projeto no Lovable Cloud.

Você já possui um domínio de e-mail que gostaria de usar para os e-mails do sistema?

### Arquivos que serão criados/editados

| Ação | Arquivo |
|---|---|
| Criar | `supabase/functions/auth-email-hook/index.ts` |
| Criar | `supabase/functions/auth-email-hook/deno.json` |
| Criar | `supabase/functions/_shared/email-templates/signup.tsx` |
| Criar | `supabase/functions/_shared/email-templates/recovery.tsx` |
| Criar | `supabase/functions/_shared/email-templates/magic-link.tsx` |
| Criar | `supabase/functions/_shared/email-templates/invite.tsx` |
| Criar | `supabase/functions/_shared/email-templates/email-change.tsx` |
| Criar | `supabase/functions/_shared/email-templates/reauthentication.tsx` |
| Upload | `src/assets/logo.png` → Storage bucket `email-assets` |

