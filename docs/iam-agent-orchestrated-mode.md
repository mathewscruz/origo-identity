# Modo `agent_orchestrated` — Órigo Agente como executor principal

## Divisão de responsabilidades

**Lovable/Supabase** (mantido):
- Frontend (portal, admin, revisões, catálogo)
- Fila `iam_queue` (persistência, estados, deduplicação)
- Fluxo de aprovação e SoD
- Catálogo de recursos (perfis, cargos, grupos, licenças, apps)
- Auditoria, alertas e trilha JML
- Reconciliação com base CSV/Entra (linkagem de identidades)

**Órigo Agente** (executor real):
- Consome `iam-agent-api /pending` e devolve resultado via `/update`
- Executa AD local (Powershell) — comportamento legado mantido
- Executa Entra ID (Graph): assign/remove grupo, licença, app; enable/disable/update
- Executa apps externos (create/update/disable/delete_user_app)
- Pré-check e pós-check de estado real (AD e Entra live)
- Snapshot e rollback quando aplicável
- Dry-run antes de lotes destrutivos

## Chave de configuração

```
parametros.iam_execution_mode ∈ { 'legacy', 'agent_orchestrated' }
```

- `legacy` (padrão histórico): `process-iam-queue` executa Entra/apps; `iam-agent-api` expõe apenas AD local.
- `agent_orchestrated`: `process-iam-queue` NÃO executa ações críticas (retorna HTTP 202 com `delegated`); `iam-agent-api /pending` também expõe Entra/apps ao agente.

Migração de ativação: `supabase/migrations/20260702212500_iam_agent_orchestrated_mode.sql`.

## Guardrails obrigatórios do agente

- **Dry-run antes de lote**: qualquer batch destrutivo (>N remoções) precisa de dry-run e confirmação.
- **Bloquear `enable_entra`** sem joiner/rehire aprovado formalmente (workflow ou aprovação registrada em `iam_queue` / `evento_jml_aprovacoes`).
- **Validar AD/Entra live** antes de agir: `accountEnabled`, membership atual, sku vigente.
- **Nunca excluir conta / mailbox / OneDrive** — apenas `disable_entra`. Exclusão fica fora do agente.
- **Não agir em homônimo/recontratado**: exigir match único por `entra_id`/`email`/`sam`/`matricula`; ambiguidade → cancela e loga alerta.
- **Não remover grupo `on_premises_sync=true`** via Graph — sinaliza como `on_premises_managed` e devolve status apropriado para o AD tratar.
- **Não executar `assign_app`/`remove_app`** para apps externos até handler dedicado por conector estar em produção.

## Próximas etapas

1. **Claim/lease transacional**: adicionar coluna `claimed_by`/`claimed_until` em `iam_queue` para evitar dois executores pegando o mesmo item; usar RPC `select ... for update skip locked`.
2. **RPC de aprovação auditada**: substituir writes diretos por `rpc('approve_iam_item', ...)` que grava aprovador, motivo e trilha.
3. **State machine rígida**: estados válidos e transições (`pending → claimed → processing → success|failed|retry|cancelled`); rejeitar transições inválidas no banco.
4. **Revisar botões que chamam `process-iam-queue` com `force:true`**: no modo `agent_orchestrated`, esses botões devem apenas disparar reprocessamento pelo agente, não tentar executar Graph diretamente.
