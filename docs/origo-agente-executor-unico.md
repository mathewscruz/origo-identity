# Órigo Agente (Hermes) — executor único

Desde 2026-09-18 **não existe outro executor**: nenhuma edge function escreve em AD,
Entra ID, SharePoint ou apps externos. O Lovable Cloud é o plano de controle
(fila, aprovação, catálogo, auditoria, agenda) e o agente é o plano de execução.

## Divisão de responsabilidades

**Lovable/Supabase (plano de controle)**
- Frontend (painel admin, revisões, catálogo) e MCP para o Hermes
- Fila `iam_queue`: máquina de estados, aprovação (anti-auto-aprovação), reserva (claim/lease),
  idempotência por `resource_key`, acesso efetivo (RPCs `iam_enqueue_*`)
- Ciclo de vida JML como RPCs transacionais (`jml_*`, `colaborador_salvar`, `terceiro_salvar`,
  `terceiro_alterar_status`, `excecao_decidir`, `iam_enqueue_reset_password`, `iam_revogar_individual`)
- Leitura do Entra/SharePoint (Graph **somente leitura**): catálogo de grupos/licenças/apps/sites,
  base do RH, reconciliação de identidades (`reconcile-identities`), acesso real por pessoa
  (`sync-user-access`)
- Agenda `pg_cron`: ciclo diário do RH, expiração de exceções, recertificação, auditoria
- Auditoria imutável, alertas, notificações por e-mail

**Órigo Agente (plano de execução)** — `agent/origo_iam_agent_executor.py`
- `GET /pending` reserva itens (status `processing`, `claim_token`, lease) e recebe `identity`
  já resolvida (e-mail / SAM / entra_id)
- Executa: AD local (LDAP ou ponte HTTP): `create`, `create_if_not_exists`, `update`, `disable`,
  `reset_password`; Entra (Graph): `disable_entra` (+ revogação de sessões), `enable_entra`,
  `update_entra`, `assign/remove_group`, `assign/remove_license`, `assign/remove_app`,
  `reset_password` para contas cloud; SharePoint: `assign/remove_sharepoint`; apps externos:
  `*_user_app` (quando houver handler)
- `POST /update` com `claim_token` e `status` (`success` | `failed` + `error_code` retentável |
  `cancelled`); `POST /release` devolve o item sem executar (dry-run)
- Cada chamada envia `X-Agent-Version`, `X-Agent-Host`, `X-Agent-Execute` → `iam_agent_status`
  (o dashboard mostra online / sem sinal / offline, versão, modo e último resultado)

## Reset de senha

1. UI, MCP (`reset_password`) ou RPC `iam_enqueue_reset_password` cria o item `reset_password`
   (`requested_by` = e-mail de quem pediu; contas privilegiadas exigem admin; um por conta).
2. O agente define a senha temporária (AD via LDAPS + `pwdLastSet=0`, ou Entra com
   `forceChangePasswordNextSignIn`) e devolve `secret` no `/update`.
3. A API envia a senha por e-mail ao solicitante (`send-notification-email`, tipo
   `senha_temporaria`) e **não a persiste**. Se o e-mail falhar, o item fica `failed`
   (`secret_delivery_failed`) com instrução para refazer após corrigir o SendGrid.

## Guardrails do agente

- `enable_entra` só com aprovação registrada na fila (`approved_by/approved_at`), a menos que
  `iam_enable_requires_approval = false`
- Identidade resolvida de forma **estrita** (entra_id → e-mail/UPN → SAM); ambiguidade ⇒ `user_not_found`
- Nunca remove grupo `on_premises_sync`, dinâmico ou role-assignable via Graph
- Nunca exclui conta / mailbox / OneDrive — apenas `disable_entra`
- Dry-run (padrão sem `--execute`) libera os itens sem concluir

## Hermes e GLPI

O Hermes entra pelo MCP (`supabase/functions/mcp`, OAuth do usuário) e **nunca escreve na fila
nem executa** diretamente. Para chamados:

| Pedido do chamado | Ferramenta MCP |
|---|---|
| localizar pessoa / recursos | `list_colaboradores`, `get_colaborador`, `list_terceiros`, `list_catalog`, `get_effective_access` |
| conceder / revogar grupo, licença, app, SharePoint, perfil | `request_access` (gera itens na fila, aprovação se exigida) |
| reset de senha | `reset_password` |
| desligamento, reativação, mudança de cargo, suspensão preventiva | `start_jml_event` |
| acompanhar / decidir | `list_iam_queue`, `approve_iam_item` (nunca o próprio solicitante) |

## Operação

```
export IAM_AGENT_API_URL="https://<ref>.supabase.co/functions/v1/iam-agent-api"
export IAM_AGENT_TOKEN="..."            # mesmo valor do secret IAM_AGENT_TOKEN do projeto
export AZURE_TENANT_ID=... AZURE_CLIENT_ID=... AZURE_CLIENT_SECRET=...
export AD_LDAP_HOST=... AD_LDAP_PORT=636 ORIGO_AD_LDAP_PASSWORD=...   # ou AD_BRIDGE_URL
python agent/origo_iam_agent_executor.py --execute --interval 30 --limit 10 --lease 600
```

Sem o agente rodando, os itens ficam `pending` e o dashboard mostra o executor como offline.
