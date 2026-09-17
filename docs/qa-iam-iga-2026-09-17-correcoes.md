# Correções do QA IAM/IGA — status (2026-09-17)

Complemento de [qa-iam-iga-2026-09-17.md](qa-iam-iga-2026-09-17.md). Tudo abaixo foi implementado e
verificado no ambiente local (migrations do zero, `db/tests/iga_smoke.sql` com 12 cenários,
boot das 23 edge functions, importação de CSV de ponta a ponta, aprovação pela UI).

## Arquitetura resultante

| Camada | Antes | Agora |
|--------|-------|-------|
| Ciclo de vida JML | ~15 escritas no navegador, sem transação; cópia divergente no CSV | RPCs transacionais: `jml_alterar_status`, `jml_alterar_cargo`, `jml_pre_leaver(_reverter)`, `terceiro_alterar_status` — usados por UI, CSV, expiração automática, MCP e `start-jml-event` |
| Geração de itens da fila | 5 implementações; remoção ignorava outros perfis | `iam_enqueue_profile_actions` / `iam_enqueue_resource_diff` / `iam_enqueue_individual_removals` com **acesso efetivo** (perfis ativos + concessões individuais) e `resource_key` + índice único de item aberto |
| Fila | sem reserva, sem máquina de estados, qualquer operador mudava status | `CHECK` de status, trigger de transições, `claim_iam_queue_items` (lease) / `complete_iam_queue_item` (claim_token), `iam_queue_decidir` (approved_by = usuário logado, **auto-aprovação recusada**), `iam_queue_reprocessar` |
| Importação RH | duas cópias; DELETE de colaborador; sem limite | `_shared/csvColabSync.ts` (uma só): nunca apaga, limite de segurança (`csv_leaver_limite_pct/abs`), quarentena real (`colab_quarentena`), recontratação por CPF, e-mail nunca regenerado, dry-run |
| Agenda | nada rodava sozinho | `pg_cron` + `pg_net` + Vault: ciclo diário 06:30 UTC, expiração 05:00, recertificação 05:15, fila a cada 15 min, auditoria semanal |
| Segurança | operador ≈ admin; auditoria editável; `admin_exec_sql` para qualquer admin | auditoria append-only (trigger), `parametros` só admin, papel **`platform_admin`** para SQL/DDL/purga, identidades nunca apagadas (DELETE vira desligamento), token de revisão externa com validade, ator real em todas as funções |

## Por achado

| # | Achado | Correção |
|---|--------|----------|
| C1 | `start-jml-event` não subia | Reescrita: valida, resolve colaborador (id ou nome único) e **executa** via RPCs (leaver/joiner/mover/pré-leaver) |
| C2 | Tool MCP `approve_iam_item` quebrada | Chama `iam_queue_decidir` (approve/reject/cancel, vários ids); bundle `supabase/functions/mcp/index.ts` regenerado (`scripts/build-mcp-function.mjs`) |
| C3 | Expiração de terceiro não revogava nada | `auto-recertification` chama `terceiro_alterar_status(false, 'auto_expiracao')`: disable_entra/AD, remoções, evento, alerta, auditoria |
| C4 | Leaver por ausência apagava colaborador; fantasmas apagados | Nunca há DELETE: trigger `colaboradores_soft_delete` converte em desligamento; CSV desliga via RPC com limite de segurança; `reconcile-identities` não apaga mais (marca/enfileira) |
| C5 | Leaver do RH não removia acessos do cargo | `jml_alterar_status('desligado')` revoga todos os perfis e enfileira `remove_*` + remoções individuais |
| C6 | Agente: `enable_entra` sempre falhava, AD `update` não suportado, itens sem e-mail | Guardrail lê `approved_by/approved_at` (e a política via `enable_requires_approval`); `/pending` entrega `identity` resolvida; LDAP implementa `update` (reabilitar + title/department/company); `disable_entra` revoga sessões |
| C7 | Sem claim, sem máquina de estados, aprovação sem enforcement | Ver "Fila" acima; `iam-agent-api` reserva no `/pending`, exige `claim_token` no `/update` (compatibilidade para agente antigo no mesmo owner), `/release`, `/health`; `process-iam-queue` também usa claim |
| C8 | Remoções ignoravam acesso efetivo; `remove_license` herdada removia grupo | RPCs de acesso efetivo em todos os caminhos (expiração, revisão externa, remoção de perfil, leaver, mover); `remove_license` herdada agora falha com `license_inherited_from_group` (sem tocar no grupo) |
| C9 | Mover não removia nada | `jml_alterar_cargo` remove o exclusivo do cargo anterior; padrão `mover_remocao_modo = aprovacao` (waiting_approval); `imediato` ou `nenhum` configuráveis |
| C10 | SharePoint quebrado no executor Lovable | `assign_sharepoint`/`remove_sharepoint` implementados em `process-iam-queue` (mesma semântica do agente); templates de recurso geram o tipo correto |
| A1 | Override manual criava exceção de 1 ano | Removido. Fica só `desligado_manual` (bloqueia reativação pelo CSV até o RH convergir) e exceções **reais** `manter_ativo` (honradas por todos os caminhos) |
| A2 | JML no navegador sem transação | RPCs (acima); libs do frontend viraram wrappers |
| A3 | Duplicações divergentes | CSV unificado; provisionamento de cargo único (`jml_alterar_cargo`); helpers Graph em `_shared/graph.ts` |
| A4 | Nada rodava sozinho | pg_cron (migration `…120600`); functions agendadas aceitam service role; `run-daily-cycle` propaga service role |
| A5 | Privilégios | `platform_admin`; auditoria imutável; `parametros` só admin; `reset-entra-password` registra o ator e exige admin para contas privilegiadas; `admin-create-user` só concede `platform_admin` a partir de um `platform_admin` |
| A6 | Sem unicidade de identidade | UNIQUE parcial em `perfil_atribuicoes` ativa; UNIQUE em e-mail/SAM/matrícula de `colaboradores` **se a base não tiver duplicatas** (senão gera alerta crítico com instrução); `iam_queue.terceiro_id` + FKs `NOT VALID` |
| A7 | Dados ruins viravam identidades | Linhas sem matrícula/duplicadas → `colab_quarentena` (com dados e motivo) |
| A8 | E-mail regenerado; domínios hardcoded | Só na criação; parâmetros `csv_email_dominio`, `csv_gerar_email_corporativo`, `ad_upn_dominio`, `sharepoint_rh_*` |
| A9 | Matching permissivo | `_shared/graph.ts`: só entra_id / e-mail-UPN-proxy / SAM / employeeId exatos; ambiguidade ⇒ falha + alerta `identidade_ambigua` |
| A10 | Bugs internos do `process-iam-queue` | Um único ponto de delegação (auditoria com throttle de 1h); force não repete o mesmo item; 404/403/400 definitivos; `assign_app` só escolhe role inequívoco; classificação por status HTTP |
| M1 | `eventos_jml.status` cosmético | Eventos nascem `executado` (log); joiners legados `pendente` são resolvidos pela reconciliação; `mover` só com mudança de cargo/área/empresa |
| M2 | Reativação via CSV sem perfis | `jml_alterar_status('ativo')` reprovisiona o cargo e restaura individuais **com aprovação** |
| M3 | Órfãos | dedupe por `resource_key` sem limite de 2 000 |
| M4 | Invocação interna com 401 | Funções aceitam service role (`requireRoleOrService`) |
| M5 | Token de revisão sem validade | `revisoes.token_expires_at` (30 dias) checado nos RPCs e em `save-external-review` |
| M6 | Simulação escrevia | reconciliação e CSV em modo simulação só reportam |
| M7 | `enable_entra` automático | Reabilitação **sempre** `waiting_approval` (`iam_enable_requires_approval`, padrão `true`) — na UI, no CSV, na reconciliação e nos RPCs |
| M8 | Terceiros | `terceiros.sam_account_name`; `iam_queue.terceiro_id`; exceções de terceiro tratadas no RPC |
| M9 | Ledger na fila | Mantido por ora, mas com `resource_key` em todas as linhas (`sync-user-access` incluído) e leitura centralizada em `iam_individual_resources` / `iam_effective_access` |
| M10 | SoD só no portal | *Não alterado* (ver "Pendências") |
| R* | Remoções | Motor de regras (tabelas, função, célula da Matriz), `colab_snapshots`, guardrails de restore (com trava se estiverem ativos), `restoreOnly` — removidos. Tabelas `backup_*` e `iam_change_backups` mantidas (são dados) |

## Decisões tomadas sem confirmação (revisar)

1. **Executor**: ~~mantive os dois modos~~ → decidido em 2026-09-18: **só o Hermes/Órigo Agente executa**; `process-iam-queue` e `iam_execution_mode` foram removidos (ver [revisao-2026-09-18-executor-unico-tempo-real.md](revisao-2026-09-18-executor-unico-tempo-real.md)).
2. **Hermes pode aprovar** (tool `approve_iam_item` corrigida), mas sempre em nome do usuário OAuth conectado e sujeito à anti-auto-aprovação. Se a política for "agente só executa", basta remover a tool de `src/lib/mcp/index.ts` e regenerar o bundle.
3. **Mover**: remoções do cargo anterior entram em `waiting_approval` (`mover_remocao_modo = aprovacao`).
4. **Reabilitação** (retorno de férias, reversão de pré-leaver, recontratação, divergência CSV×Entra) sempre exige aprovação (`iam_enable_requires_approval = true`).
5. **Férias/afastamento** continuam desabilitando a conta (comportamento anterior mantido).
6. **`platform_admin`** nasce sem ninguém: as tools `run_admin_sql`/`apply_migration` e a purga ficam indisponíveis até um admin atual conceder o papel a alguém (`Usuários do Sistema`).
7. **Limite de leavers**: 5 % (com base ≥ 20 ativos) ou 50 absolutos — ajustável em `parametros`.

## Pendências / próximos passos

- **Agenda em produção**: executar uma vez no SQL editor do Lovable Cloud:
  `select vault.create_secret('https://jobopjhhxgcfanlhzlkc.supabase.co/functions/v1', 'origo_functions_url');`
  `select vault.create_secret('<SERVICE_ROLE_KEY>', 'origo_service_role_key');`
  Sem isso os jobs só registram NOTICE. Conferir com `select jobname, schedule, active from cron.job;`.
- **Migration de limpeza** (`20260917120500`) falha de propósito se `iam_restore_guardrails.active = true` em produção — nesse caso desativar a chave antes.
- **Índices únicos de identidade**: se a base de produção tiver duplicatas, a migration `20260917120400` gera o alerta "Duplicidade de identidades" em vez de criar os índices; corrigir os dados e reaplicar.
- **Agente**: publicar a nova versão de `agent/origo_iam_agent_executor.py` junto com a API (a API aceita o agente antigo enquanto `owner`/`processed_by` coincidirem, mas o guardrail de `enable_entra` só funciona com a versão nova).
- **SoD preventivo no servidor** (M10) e **tabela de entitlements** substituindo o ledger da fila (M9) ficaram como evolução — a base para isso (`iam_effective_access`, `resource_key`) já existe.
- **GLPI**: continua fora do repositório; desde 2026-09-18 o Hermes tem `request_access`, `reset_password`, `list_catalog` e `get_effective_access` no MCP — nunca insere direto na fila.
- Lint: ~1 200 `no-explicit-any` pré-existentes não foram tocados.
