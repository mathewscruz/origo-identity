# Deploy em produção (Lovable Cloud) — versão 2026-09-18

Produção = Lovable Cloud (projeto `jobopjhhxgcfanlhzlkc`). O código chega pelo GitHub (`main`);
**migrations e edge functions não são aplicadas pelo sync** — é preciso pedir ao Lovable (chat do
projeto) e depois clicar em **Publish**. Este roteiro cobre tudo o que esta versão precisa.

## 0. O que muda nesta versão

- 14 migrations novas (`20260917120000` → `20260918140000`) + `20260806141300_reconstruct_manual_objects.sql`
  (só cria objetos que já existem em produção — no-op lá).
- Edge functions: **novas/alteradas** `admin-users`, `auto-recertification`, `save-external-review`,
  `send-review-email`, `send-notification-email`, `iam-agent-api`, `reconcile-identities`, `mcp`,
  `run-daily-cycle`, `sync-*`, `_shared/*`; **removidas** `process-iam-queue`, `reset-entra-password`,
  `admin-create-user`.
- Agente `agent/origo_iam_agent_executor.py` v2.0.0 (executor único; heartbeat; reset de senha).
- Módulos removidos: Solicitações / Workflow / Portal (tabelas `solicitacoes_acesso`, `solicitacao_itens`,
  `workflow_*`). As migrations preservam tudo o mais; `iam_change_backups` só é removida se estiver vazia.

## 1. Antes (5 min)

1. **Backup**: Lovable → More → Cloud → Overview → Advanced settings → *Export data* (1 por 24 h).
2. Confirme os segredos do projeto (Cloud → Secrets): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_CLIENT_SECRET` (Graph **somente leitura**), `SENDGRID_API_KEY`, `IAM_AGENT_TOKEN`,
   `SITE_URL` (= URL publicada, usada nos links de e-mail).
3. Avise que o agente ficará parado durante a janela (pare o serviço no host do agente).

## 2. Código

```bash
git push origin main
```

O Lovable sincroniza em ~1 min (aba GitHub do projeto mostra o commit).

## 3. Banco + functions — prompt para o Lovable

Cole no chat do projeto (modo padrão, não "plan"):

> Aplique, em ordem, todas as migrations pendentes de `supabase/migrations` que ainda não estão no
> banco (de `20260806141300_reconstruct_manual_objects.sql` até `20260918140000_admin_usuarios_atividade_pessoa.sql`),
> sem alterar o conteúdo dos arquivos. Depois faça o deploy de TODAS as edge functions do repositório
> (`supabase/functions/*`, incluindo `admin-users`, `mcp`, `auto-recertification`, `save-external-review`,
> `send-review-email`, `send-notification-email`, `iam-agent-api`, `reconcile-identities`) e remova do
> projeto as functions que não existem mais no repositório: `process-iam-queue`, `reset-entra-password`
> e `admin-create-user`. Não crie nem edite nenhum arquivo; se alguma migration falhar, pare e me mostre o erro.

Se o Lovable relatar erro em uma migration, me mande a mensagem — todas são idempotentes e podem ser
reaplicadas depois da correção.

## 4. Uma vez, no SQL editor do Cloud (agenda + segredos do pg_cron)

```sql
select vault.create_secret('https://jobopjhhxgcfanlhzlkc.supabase.co/functions/v1', 'origo_functions_url');
select vault.create_secret('<SERVICE_ROLE_KEY do projeto>', 'origo_service_role_key');
select jobname, schedule, active from cron.job where jobname like 'origo-%';
-- esperado: origo-expire-exceptions, origo-auto-recertification, origo-daily-cycle, origo-audit-reconciliation
```

Se `origo-process-queue` ainda aparecer: `select cron.unschedule('origo-process-queue');`

## 5. Publish

Lovable → **Publish** (atualiza a URL de produção com o novo frontend).

## 6. Depois (checklist de fumaça — 10 min)

1. Login → Dashboard carrega com faixa de status e "Atividade recente".
2. **Usuários do painel**: conceda `platform_admin` a você (Usuários → Editar). Crie um usuário de teste,
   desative (deve ficar "bloqueado no Auth" e o login dele recusar), reative, exclua.
3. Parâmetros: confira `iam_approval_required`, `terceiro_revalidacao_dias`,
   `terceiro_revalidacao_prazo_dias` (7), `revisao_periodicidade_dias`, `revisao_gestor_periodicidade_dias`.
4. Integrações: "Executar ciclo agora" (dry-run do CSV) e "Reconciliar" — sem erro.
5. Suba o agente v2.0.0 com `IAM_AGENT_TOKEN`: em ~1 min o dashboard mostra "Agente online".
6. Revisões: crie uma campanha de teste por aplicação, abra o link externo, decida e conclua — o item
   `remove_*` deve aparecer na fila **pendente e aprovado** e o agente executar.
7. Alertas e Auditoria abrem em `/alertas` e `/auditoria` (links antigos redirecionam).

## Rollback

- Frontend: Lovable → histórico → "Restore" da versão anterior + Publish.
- Banco: restaurar o export do passo 1 (Cloud → Advanced settings) — as migrations não são reversíveis
  individualmente (removem os módulos Solicitações/Workflow).
