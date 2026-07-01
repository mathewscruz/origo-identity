## QA geral do sistema — Órigo Access & Identity

Vou atuar como QA e produzir **um relatório final consolidado em `/mnt/documents/qa-report.md`** com achados classificados (🔴 crítico, 🟡 atenção, 🟢 ok) e, para cada achado crítico/atenção, uma correção sugerida. Correções serão aplicadas apenas se você aprovar em batch depois do relatório.

## Sinais que já detectei no snapshot inicial

- 🔴 **6 `sync_jobs` em `running`** — provável travamento (>10min sem update), guard-rail não limpou.
- 🔴 **`iam_execution_mode` está NULL** — modo de execução indefinido (simulação vs produção).
- 🟡 **15 itens `failed` na fila**, apenas **2 sucessos em 7 dias** e **5767 cancelados** — workers com baixa vazão e limpeza pesada.
- 🟡 **3360 waiting_approval** empilhados sem aprovador ativo.
- 🟡 **3 sync_jobs em erro** nos últimos 7 dias.

## Escopo da auditoria QA (10 blocos)

### 1. Integridade dos dados
- Colaboradores duplicados por `matricula`/`email`/`entra_id` (unique constraints e órfãos).
- FKs quebradas em `iam_queue.colaborador_id`, `eventos_jml.colaborador_id`, `perfil_atribuicoes.perfil_id`.
- Colabs `ativo` sem email / sem sam_account_name / sem cargo.
- Terceiros expirados ainda ativos.

### 2. Reconciliação CSV × Entra × AD
- Rodar a `audit-reconciliation` já existente para confirmar assertividade da última rodada.
- Verificar cobertura: joiners criados, reativações, órfãos, atributos.
- Amostra manual de 5 desligados para validar cadeia CSV→leaver→queue→execução.

### 3. Fila de provisionamento (`iam_queue`)
- Itens `processing` há >30min (worker preso).
- Itens `failed` com `attempts >= max_attempts` — verificar `error_code` predominante.
- Itens `pending` órfãos (colab deletado).
- Concorrência do `process-iam-queue`: locking correto?
- Aprovação gate: `iam_approval_required=true` mas sem workflow de aprovação configurado → itens ficam parados eternamente.

### 4. Workflow JML (Joiner-Mover-Leaver)
- `eventos_jml` pendentes há >72h.
- Pré-desligamento manual: verificar flag `desligado_manual` respeitada no `sync-csv-colab`.
- Leavers sem correspondente `disable`/`disable_entra` na fila.

### 5. Governança
- **SoD**: `sod_conflitos` abertos + regras ativas × atribuições correntes (falsos negativos).
- **Recertificação**: `revisoes` `em_andamento` vencidas (`data_fim < now`).
- **Exceções**: `excecoes` vencidas ainda com `ativo=true` (function `expire-access-exceptions`).
- **Órfãos Entra**: comparar Entra vs colabs.

### 6. Sincronizações (sync-* functions)
- Última execução de cada `sync-*` em `sync_jobs`.
- Erros recorrentes por função.
- `sync-csv-colab`: verificar SHA-256 incremental funcionando (não re-processar CSV igual).
- `sync-entra-*`: paginação completa (sem cortar em 1000).

### 7. Segurança / RLS
- Rodar `supabase--linter` e `security--run_security_scan`.
- Verificar policies em: `iam_queue`, `colaboradores`, `user_roles`, `parametros`, `auditoria`.
- Grants no schema `public` para novas tabelas.
- Secrets: nenhum log de edge function expõe token.

### 8. Frontend (rotas críticas)
- Playwright headless nas rotas: `/`, `/aprovacao-iam`, `/fila-provisionamento`, `/colaboradores`, `/configuracoes/integracoes`, `/eventos-jml`.
- Captura de screenshots + erros console + falhas de rede.
- Verificar KPIs do Dashboard batem com queries diretas (regressão da correção anterior).

### 9. Performance
- `supabase--db_health` + `supabase--slow_queries`.
- Tempos de resposta das principais queries do dashboard.
- Índices ausentes em `iam_queue(status, action_type)`, `colaboradores(status)`, `eventos_jml(status, tipo)`.

### 10. Configuração operacional
- `parametros`: presença e valor de `iam_approval_required`, `iam_execution_mode`, `csv_incremental_hash`, etc.
- Cron desabilitado (memory diz "sem cron"): confirmar via `pg_cron.job` que nenhum job está agendado.
- Secrets Azure/SendGrid presentes.

## Entregável

1. `qa-report.md` com todos os achados agrupados por severidade + tabela de status por bloco.
2. Uma seção final "Correções sugeridas" com plano de fix priorizado.
3. **Não vou corrigir nada durante a auditoria** — só reportar. Após você aprovar o relatório, aplico os fixes em outra rodada.

## Fora de escopo

- Testes E2E completos de fluxo de usuário.
- Refatorações estruturais.
- Correção de bugs cosméticos.
- Alterações de RLS sem sua aprovação explícita.

## Tempo estimado

~15-20 chamadas de tool (queries + Playwright + linter + auditoria). Sem alterações de dados/schema nesta fase.
