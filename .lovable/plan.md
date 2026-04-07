

## Status da lista — O que falta implementar

### Ja implementados (10 de 14)

| # | Item | Status |
|---|---|---|
| 1 | Dashboard com dados reais | Feito |
| 2 | Matriz dinamica | Feito |
| 4 | Self-Service / Solicitacoes | Feito |
| 5 | Workflow multi-nivel | Feito |
| 6 | SoD / Conflitos | Feito |
| 7 | Recertificacao automatica | Feito (Edge Function) |
| 8 | Relatorios e Compliance | Feito |
| 9 | Contas Orfas | Feito (aba em Relatorios) |
| 11 | Dashboard dados reais (duplicado do 1) | Feito |
| 12 | Matriz dinamica (duplicado do 2) | Feito |
| 13 | Notificacoes in-app | Feito |
| 14 | Expiracao de terceiros | Feito (na Edge Function auto-recertification) |

### Faltam implementar (2 itens)

**Item 3 — Terceiros sem integracao de provisionamento no frontend**

A Edge Function `auto-recertification` ja faz a expiracao automatica no backend, porem no frontend (pagina de terceiros) nao ha:
- Botao para gerar evento JML manualmente ao desligar um terceiro
- Disparo automatico de provisionamento (revogar grupos/licencas/apps via `iam_queue`) quando o terceiro e desativado pela UI
- Criacao de evento JML tipo "leaver" ao desativar

**Plano:**
- Editar `TerceiroDetalhePage.tsx` — ao desativar um terceiro, criar evento JML "leaver", revogar `perfil_atribuicoes` ativas e gerar entradas `remove_group`/`remove_license`/`remove_app` na `iam_queue` (usando `entraQueueHelper`)
- Adicionar botao "Desligar Terceiro" que executa esse fluxo completo

---

**Item 10 — Gestao de Senhas**

Integracao com Microsoft Graph API para:
- Reset de senha de usuarios no Entra ID
- Visualizar data da ultima troca de senha
- Notificar sobre senhas proximas de expirar

**Plano:**
- Criar Edge Function `reset-entra-password` que chama Graph API `PATCH /users/{id}` com `passwordProfile`
- Adicionar botao "Resetar Senha" na pagina de detalhe do colaborador (`ColaboradorDetalhePage.tsx`)
- Adicionar coluna "Ultima troca de senha" nos dados do colaborador (via sync do Entra)

---

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — fluxo de desligamento com JML + provisioning |
| Criar | `supabase/functions/reset-entra-password/index.ts` — reset de senha via Graph API |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — botao resetar senha |

