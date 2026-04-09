

## Plano: Integrar envio de e-mails via SendGrid

### Contexto

Hoje o sistema tem uma edge function `send-review-email` que apenas registra o e-mail na auditoria mas **não envia de fato**. Vamos integrá-la com o SendGrid para envio real, além de criar uma função utilitária reutilizável para outros e-mails futuros.

### Pré-requisito

Será necessário adicionar o secret `SENDGRID_API_KEY` ao projeto. Vou solicitar isso antes de implementar.

### Alterações

**1. Adicionar secret `SENDGRID_API_KEY`**
- Solicitar ao usuário via ferramenta de secrets

**2. Criar função utilitária `_shared/sendgrid.ts`**
- Helper reutilizável que encapsula a chamada à API do SendGrid (`https://api.sendgrid.com/v3/mail/send`)
- Aceita: `to`, `subject`, `htmlContent`, `from` (com default para um remetente padrão)
- Retorna sucesso/erro

**3. Atualizar `supabase/functions/send-review-email/index.ts`**
- Importar o helper SendGrid
- Montar HTML do e-mail de revisão com: nome da aplicação, link de revisão, data limite
- Enviar de fato via SendGrid antes de registrar na auditoria
- Registrar na auditoria se o envio foi bem-sucedido ou falhou

**4. Configurar remetente**
- Usar o e-mail verificado no SendGrid como remetente (ex: `noreply@origoenergia.com.br`)
- Preciso saber qual e-mail/domínio está verificado no SendGrid

### Detalhes técnicos

```text
send-review-email
  ├── Busca dados da revisão (já existe)
  ├── Monta HTML do e-mail
  ├── POST https://api.sendgrid.com/v3/mail/send
  │     Authorization: Bearer $SENDGRID_API_KEY
  │     Body: { from, to, subject, content }
  ├── Registra resultado na auditoria
  └── Retorna sucesso/erro
```

### Pergunta necessária

Qual é o e-mail remetente verificado no SendGrid? (ex: `noreply@origoenergia.com.br`)

### Arquivos

| Ação | Arquivo |
|---|---|
| Criar | `supabase/functions/_shared/sendgrid.ts` — helper de envio |
| Editar | `supabase/functions/send-review-email/index.ts` — envio real via SendGrid |

