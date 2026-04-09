

## Plano: Configurar todos os e-mails da ferramenta via SendGrid

### Varredura dos modulos — E-mails necessarios

Apos analisar todos os modulos do sistema, identifiquei os seguintes pontos onde e-mails devem ser enviados:

| # | Cenario | Destinatario | Existe hoje? |
|---|---------|-------------|-------------|
| 1 | Revisao de acesso criada | Owner da aplicacao | Sim (send-review-email) |
| 2 | Solicitacao de acesso criada | Aprovador (gestor/owner) | Nao |
| 3 | Solicitacao aprovada/rejeitada | Solicitante (colaborador/operador) | Nao |
| 4 | Excecao de acesso criada | Aprovador | Nao |
| 5 | Excecao aprovada/rejeitada | Solicitante | Nao |
| 6 | Colaborador desligado/desabilitado | Gestor do colaborador | Nao |
| 7 | Terceiro com contrato expirando | Responsavel pelo terceiro | Nao |
| 8 | Alerta critico gerado | Admins do sistema | Nao |
| 9 | Revisao de acesso concluida | Admin que criou a campanha | Nao |
| 10 | Lembrete de revisao pendente (prazo proximo) | Owner da aplicacao | Nao |

### Arquitetura

Criar uma unica edge function generica `send-notification-email` que recebe um `tipo` e os dados necessarios, monta o template HTML correspondente e envia via SendGrid usando o helper `_shared/sendgrid.ts` ja existente.

```text
send-notification-email
  ├── tipo: "revisao_criada" | "solicitacao_criada" | "solicitacao_decidida" | ...
  ├── payload: { destinatario, dados contextuais }
  ├── Seleciona template HTML pelo tipo
  ├── Envia via _shared/sendgrid.ts
  └── Registra na auditoria
```

### Alteracoes

**1. Criar `supabase/functions/send-notification-email/index.ts`**
- Edge function generica que aceita `{ tipo, payload }` 
- Templates HTML para cada cenario, todos em portugues com visual consistente (gradiente escuro no header, botao de acao, rodape Origo Identity)
- Tipos suportados:
  - `solicitacao_criada` — avisa aprovador
  - `solicitacao_decidida` — avisa solicitante do resultado
  - `excecao_criada` — avisa aprovador
  - `excecao_decidida` — avisa solicitante do resultado
  - `colaborador_desabilitado` — avisa gestor
  - `terceiro_expirando` — avisa responsavel
  - `alerta_critico` — avisa admins
  - `revisao_concluida` — avisa admin criador
  - `revisao_lembrete` — lembrete de prazo ao owner

**2. Integrar chamadas nos modulos existentes**

- `src/pages/solicitacoes/SolicitacoesPage.tsx` — ao criar solicitacao e ao decidir (aprovar/rejeitar)
- `src/pages/excecoes/ExcecoesPage.tsx` — ao criar excecao e ao decidir
- `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — ao mudar status para inativo/desligado/ferias/afastado
- `src/pages/revisoes/RevisoesPage.tsx` — manter chamada existente ao send-review-email
- `supabase/functions/auto-recertification/index.ts` — ao expirar terceiro, enviar e-mail ao responsavel
- `src/pages/revisoes/RevisaoDetalhePage.tsx` ou `RevisaoExternaPage.tsx` — ao concluir revisao

**3. Buscar e-mails dos admins para alertas criticos**
- Consultar tabela `profiles` + `user_roles` para encontrar admins e enviar alertas criticos

**4. Adicionar config em `supabase/config.toml`**
- Registrar `send-notification-email` com `verify_jwt = false`

### Detalhes tecnicos dos templates

Todos os templates seguem o mesmo layout visual do e-mail de revisao ja existente:
- Header com gradiente escuro (#1a1f2c → #2d3748)
- Corpo branco com texto em portugues
- Botao de acao com gradiente roxo quando aplicavel
- Rodape cinza com "Origo Identity — Gestao de Identidades e Acessos"
- Remetente: `noreply@origoenergia.com.br` / "Origo Identity"

### Arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/send-notification-email/index.ts` |
| Editar | `supabase/config.toml` — adicionar funcao |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — enviar e-mails |
| Editar | `src/pages/excecoes/ExcecoesPage.tsx` — enviar e-mails |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — enviar e-mail ao desabilitar |
| Editar | `supabase/functions/auto-recertification/index.ts` — enviar e-mail terceiro expirando |

