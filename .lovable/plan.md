# Hermes Agent como executor único: inventário e limpeza dos gatilhos internos

## O que foi encontrado (leitura no banco de produção e no código)

Agenda automática do banco (pg_cron):

| Job | Horário (UTC) | Chama | Estado |
|---|---|---|---|
| origo-expire-exceptions | 05:00 diário | expire-access-exceptions | ATIVO |
| origo-auto-recertification | 05:15 diário | auto-recertification | ATIVO |
| origo-daily-cycle | 06:30 diário | run-daily-cycle (SharePoint -> reconcile -> fila) | ATIVO |
| origo-audit-reconciliation | 04:00 domingo | audit-reconciliation | ATIVO |
| sync-sharepoint-csv-daily | 11:00 diário | sync-sharepoint-csv (chave anon embutida) | inativo |

Nenhum gatilho de tabela chama funções externas. Os 4 jobs ativos contrariam a regra do projeto "sem sincronizações automáticas" e rodam por fora do Hermes, inclusive o ciclo diário que dispara reconcile-identities sozinho.

## Classificação das funções

Ficam (são a ponte ou ações da tela):
- iam-agent-api — canal único do Hermes (buscar fila, reportar resultado, heartbeat)
- admin-users, save-external-review, start-jml-event, send-notification-email, send-review-email — acionadas por pessoas na tela

Passam a ser disparadas só pelo Hermes (deixam de ter agenda no banco):
- expire-access-exceptions, auto-recertification, audit-reconciliation
- reconcile-identities, sync-sharepoint-csv, sync-csv-colab
- sync-entra-groups/apps/licencas/roles, sync-sharepoint-sites, sync-app-profiles, sync-user-access

Deixam de ser necessárias:
- run-daily-cycle — é só um orquestrador interno; o Hermes passa a fazer essa sequência
- Função de banco iam_cron_invoke e os segredos que ela usa (origo_functions_url / origo_service_role_key) — só existem para o cron
- Job sync-sharepoint-csv-daily (inativo, com chave exposta)

## O que será feito

1. Remover os 5 jobs da agenda do banco (migration, idempotente).
2. Remover a função de banco iam_cron_invoke.
3. Excluir a função publicada run-daily-cycle e a pasta dela.
4. Na iam-agent-api, adicionar a ação "run_task" para o Hermes disparar, com a própria credencial dele, as funções de manutenção acima (lista fechada, cada disparo registrado na auditoria). Nada muda no conteúdo das funções.
5. No executor do Hermes (agent/origo_iam_agent_executor.py), adicionar o agendamento local equivalente (exceções 05:00, recertificação 05:15, ciclo RH 06:30, auditoria domingo 04:00) — desligado por padrão, ligado por configuração no servidor do agente.
6. Atualizar a documentação de deploy e a regra do projeto.

## Fora do escopo / proteções
- Não executar reconcile-identities, importação RH nem reprocessar a fila nesta mudança.
- Não alterar identidades, iam_queue, colaboradores nem iam_change_backups.
- Funções sync-* e reconcile-identities não são apagadas: o Hermes ainda precisa delas.

## Detalhes técnicos
- Migration: `cron.unschedule` por jobname em loop, `DROP FUNCTION IF EXISTS public.iam_cron_invoke(text, jsonb)`.
- `run_task` usa allowlist e chama via fetch interno com a service key do ambiente da função.
- Remoção de run-daily-cycle via delete de edge function após o deploy.
