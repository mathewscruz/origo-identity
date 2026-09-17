# Órigo Access & Identity

Plataforma de gestão de identidades e acessos (IAM): colaboradores, terceiros,
perfis de acesso, eventos JML (Joiner/Mover/Leaver), fila de provisionamento com
aprovação, integração com Entra ID / SharePoint, exceções, revisões de acesso, SoD,
privilegiados e auditoria. Pedidos de acesso chegam pelo GLPI via Hermes (MCP).

**Stack:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui · Supabase
(Postgres, Auth, Realtime, Storage, 21 Edge Functions em Deno) · **Órigo Agente
(Python) como executor ÚNICO** de AD / Entra ID / SharePoint / apps — nenhuma
edge function escreve em diretório. Todas as telas se atualizam em tempo real
(Postgres Changes → react-query).

Produção roda no **Lovable Cloud** (Supabase gerenciado, projeto
`jobopjhhxgcfanlhzlkc`). O código é sincronizado com o GitHub
(`mathewscruz/origo-identity`).

---

## Desenvolvimento local

### Pré-requisitos

- Node 20+ (testado com 24) · Docker Desktop · [Supabase CLI](https://supabase.com/docs/guides/cli) 2.x

### 1. Instalar dependências

```bash
npm ci --legacy-peer-deps
```

> `--legacy-peer-deps` é necessário porque `lovable-tagger@1.1.13` declara
> `vite <8` e o projeto usa Vite 8 (o Lovable instala com bun, que tolera isso).

### 2. Subir o Supabase local

```bash
supabase start
```

Na primeira vez isso aplica **todas as migrations** de `supabase/migrations/` e
o `supabase/seed.sql`. As portas foram deslocadas para `544xx` em
`supabase/config.toml` para não conflitar com outros projetos locais:

| Serviço        | URL                          |
| -------------- | ---------------------------- |
| API (Kong)     | http://127.0.0.1:54421       |
| Postgres       | `postgresql://postgres:postgres@127.0.0.1:54422/postgres` |
| Studio         | http://127.0.0.1:54423       |
| Mailpit (e-mails locais) | http://127.0.0.1:54424 |
| Edge Functions | http://127.0.0.1:54421/functions/v1/&lt;nome&gt; |

Para recriar o banco do zero (migrations + seed): `supabase db reset`.

### 3. Apontar o frontend para o ambiente local

O arquivo `.env` (versionado) aponta para **produção**. O arquivo `.env.local`
(ignorado pelo git, já criado) sobrescreve com as URLs/chaves locais.
Para voltar a apontar para produção, basta renomear/remover o `.env.local`.

### 4. Rodar

```bash
npm run dev
```

Abra http://localhost:8080 e entre com o admin local criado pelo seed:

| e-mail              | senha            | papel |
| ------------------- | ---------------- | ----- |
| `admin@origo.local` | `Origo@local123` | admin |

> Alterou algo em `supabase/functions/_shared/`? O runtime local cacheia módulos
> compartilhados: `docker restart supabase_edge_runtime_jobopjhhxgcfanlhzlkc`.

### 4.1 Testes da lógica IAM (banco)

```bash
docker exec -i supabase_db_jobopjhhxgcfanlhzlkc psql -U postgres -d postgres -v ON_ERROR_STOP=1 < db/tests/iga_smoke.sql
```

18 cenários (mover, leaver, reativação, claim/lease, anti-auto-aprovação, terceiros,
acesso efetivo, idempotência, cadastro manual, reset de senha, exceções, dashboard)
numa transação com rollback. `db/tests/rh_teste_*.csv`
são fixtures para testar a importação do RH via upload (`sync-csv-colab`, `?dry_run=1`).

### 5. Segredos das Edge Functions (opcional)

As functions que falam com Microsoft Graph / SendGrid / Órigo Agente precisam
de segredos. Copie `supabase/functions/.env.example` para
`supabase/functions/.env` e preencha. O `supabase start` já serve todas as
functions com hot-reload; para carregar o arquivo de segredos:

```bash
supabase functions serve --env-file supabase/functions/.env
```

---

## Trazer os dados de produção para o ambiente local

O Lovable Cloud **não expõe** connection string nem service-role key, mas tem
um export oficial do banco:

1. No Lovable: **More → Cloud → Overview → Advanced settings → Export data**
2. No card *Database*, **Export → Start export** (limite: 1 export a cada 24h, até 5 GB)
3. Baixe o arquivo pelo link do e-mail ou em **More → Cloud → Storage**
4. Importe no banco local:

```bash
node db/import-prod-dump.mjs caminho/para/export.sql --reset --reset-passwords
```

- `--reset` recria o banco a partir das migrations antes de importar
- `--reset-passwords` define a senha `Origo@local123` para **todos** os usuários
  importados (o export não traz senhas utilizáveis) — só afeta o banco local
- Aceita `.sql`, `.sql.gz`, `.dump` (pg_dump custom) ou `.zip` contendo um deles
- Importa somente **dados** (`public.*` + `auth.users`/`auth.identities`) por
  cima do schema das migrations; arquivos de storage não vêm no export

Coloque os arquivos em `db/dumps/` (ignorado pelo git). **Nunca commite dumps.**

---

## Lógica IAM/IGA — onde está

- **Ciclo de vida (JML)**: RPCs transacionais no banco — `jml_alterar_status`, `jml_alterar_cargo`,
  `jml_pre_leaver`, `jml_pre_leaver_reverter`, `terceiro_alterar_status` (migration `20260917120200`).
  UI, CSV do RH, expiração automática e MCP chamam as mesmas funções.
- **Acesso efetivo e fila**: `iam_enqueue_profile_actions`, `iam_enqueue_resource_diff`,
  `iam_enqueue_individual_removals`, `iam_effective_access` (migration `20260917120100`).
  Remoções só saem quando nenhum outro perfil/concessão ainda concede o recurso.
- **Fila**: máquina de estados, `claim_iam_queue_items`/`complete_iam_queue_item`,
  `iam_queue_decidir` (aprovação com anti-auto-aprovação) — migration `20260917120000`.
- **Importação do RH**: `supabase/functions/_shared/csvColabSync.ts` (uma implementação para
  SharePoint e upload manual). Nunca apaga; limite de segurança de desligamentos; quarentena.
- **Executor**: só o Hermes/Órigo Agente (`agent/`, via `iam-agent-api`). Reset de senha, criação
  de conta, atributos, grupos, licenças, apps e SharePoint são itens da fila; o agente reserva,
  executa e devolve o resultado (heartbeat em `iam_agent_status`). Ver
  [docs/origo-agente-executor-unico.md](docs/origo-agente-executor-unico.md).
- **Cadastro manual / exceções / revogação individual**: RPCs `colaborador_salvar`, `terceiro_salvar`,
  `excecao_decidir`, `iam_revogar_individual`, `iam_enqueue_reset_password` (migration `20260918100000`).
- **Hermes (cérebro)**: entra pelo MCP — `get_inbox` (tudo o que espera decisão), `approve_iam_item`,
  `retry_failed_items`, `decide_exception`, `resolve_quarantine`, `ack_alerts`, `revalidate_terceiro`,
  `set_terceiro_status`, revisões (`create_review` / `decide_review_items` / `close_review`), chamados
  (`request_access`, `reset_password`, `start_jml_event`, `list_catalog`, `get_effective_access`);
  nunca insere na fila nem executa. Ciclo e receitas: [docs/hermes-playbook.md](docs/hermes-playbook.md).
- **Revisões de acesso**: RPCs `revisao_criar` (por aplicação ou por gestor), `revisao_criar_por_gestores`,
  `revisao_decidir_itens`, `revisao_concluir`, `revisao_cancelar` (migration `20260918120000`). Ao concluir,
  as revogações entram na fila **já aprovadas** (a decisão do owner/gestor é a aprovação) e o agente
  executa; o link externo (`/revisao-externa/:token`) faz o mesmo via `save-external-review`.
  Campanhas periódicas, lembretes e atrasos: `auto-recertification`.
- **Revalidação de terceiros**: campanha `tipo = terceiros` por responsável (`revisao_criar_por_responsaveis`,
  migration `20260918130000`) — e-mail com link para **Manter** ou **Desligar** cada terceiro; sem
  resposta em `terceiro_revalidacao_prazo_dias` o job conclui com "desligar" e o agente desativa.
- **Atividade recente**: `dashboard_activity()` (auditoria + fila + JML) e trigger
  `perfil_atribuicoes_audit`; rótulos humanos em `src/lib/labels.ts`.
- **Dashboard**: `dashboard_metrics()` / `dashboard_series()` (uma chamada cada), fila com
  `iam_queue_stats()` e paginação no servidor.
- **Agenda**: `pg_cron` (migration `20260917120600`) — precisa dos segredos no Vault (ver abaixo).
- **Papéis**: `viewer` < `operador` < `admin` < `platform_admin` (SQL/DDL via MCP e purga).
  Usuários do painel: edge function `admin-users` (criar, editar papel, desativar = bloqueio no Auth,
  excluir, redefinir senha) + RPC `admin_usuarios_resumo`; `/admin/usuarios`.

Histórico e decisões: [docs/qa-iam-iga-2026-09-17.md](docs/qa-iam-iga-2026-09-17.md),
[docs/qa-iam-iga-2026-09-17-correcoes.md](docs/qa-iam-iga-2026-09-17-correcoes.md) e
[docs/revisao-2026-09-18-executor-unico-tempo-real.md](docs/revisao-2026-09-18-executor-unico-tempo-real.md).
Deploy em produção (Lovable Cloud): [docs/deploy-producao.md](docs/deploy-producao.md).

### Bundle da edge function `mcp`

`supabase/functions/mcp/index.ts` é gerado a partir de `src/lib/mcp/`. No Lovable o plugin
Vite faz isso; no Windows use:

```bash
node scripts/build-mcp-function.mjs
```

## Banco de dados: migrations e "drift" de produção

O schema é versionado em `supabase/migrations/`. Alguns objetos foram criados
**manualmente em produção** (SQL editor do Lovable), fora das migrations:

- tabelas `backup_*_2026070x`, `iam_restore_guardrails`, `iam_change_backups`
- colunas de claim/lease em `iam_queue` e as funções `claim_iam_queue_items`,
  `complete_iam_queue_item`, `cleanup_expired_iam_change_backups`
- os cron jobs (`cron.schedule`) e os triggers `suppress_restore_*`

Para o histórico aplicar do zero, existe
`supabase/migrations/20260806141300_reconstruct_manual_objects.sql`
(tudo `IF NOT EXISTS` / "criar só se não existir" — no-op em produção). Assim que
tivermos um export de produção, vale conferir esses objetos contra o real
(`pg_dump --schema-only` do export) e ajustar.

Outros ajustes feitos para o ambiente local (sem efeito em produção, onde já
estavam aplicadas): `cron.unschedule` idempotente e políticas em
`realtime.messages` tolerantes a falta de privilégio.

`supabase/roles.sql` (só local, roda antes das migrations) restaura os
*default privileges* clássicos do Supabase para `anon/authenticated/service_role`,
porque a imagem local recente vem com "secure defaults" e a maioria das tabelas
do projeto depende do comportamento antigo (como em produção).

### Criando uma nova migration

```bash
supabase migration new nome_descritivo
# edite o arquivo gerado em supabase/migrations/
supabase db reset          # valida do zero
```

Ou altere pelo Studio local e gere o diff: `supabase db diff -f nome_descritivo`.

---

## Publicar em produção (Lovable Cloud)

1. Commit + push para `main` no GitHub. O Lovable sincroniza o código
   automaticamente (webhook) e reconstrói o preview.
2. **Migrations e Edge Functions não são aplicadas automaticamente** pelo sync
   do GitHub. Depois do push, peça ao Lovable (chat do projeto), por exemplo:
   > "Aplique as migrations pendentes em `supabase/migrations` e faça o deploy
   > das edge functions alteradas."
   Alternativa para DDL: a tool `apply_migration` do MCP do próprio projeto
   (`supabase/functions/mcp`), disponível para usuários admin.
3. Clique em **Publish** no Lovable para atualizar a URL de produção.
4. Uma única vez após as migrations `20260917*` (SQL editor do Cloud) — segredos da agenda:
   ```sql
   select vault.create_secret('https://jobopjhhxgcfanlhzlkc.supabase.co/functions/v1', 'origo_functions_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'origo_service_role_key');
   select jobname, schedule, active from cron.job;  -- 5 jobs origo-*
   ```
   e conceder `platform_admin` a alguém em *Usuários do Sistema* (as tools admin do MCP
   e a purga dependem disso).
5. Publicar a nova versão do agente (`agent/origo_iam_agent_executor.py` v2.0.0) — além do
   claim/identidade, ela envia heartbeat (`X-Agent-*`) e executa `reset_password` (a senha
   temporária vai por e-mail ao solicitante via `send-notification-email`; exige `SENDGRID_API_KEY`).
6. Remover do Lovable Cloud as functions apagadas (`process-iam-queue`, `reset-entra-password`)
   e conferir que só o agente possui credenciais de escrita no Graph/AD.

Antes de publicar: `npm run build && npm test` e o teste SQL da seção 4.1.

---

## Estrutura

```
src/                 frontend (pages/, components/, hooks/, lib/iam, lib/mcp)
supabase/migrations  schema versionado (71 arquivos)
supabase/functions   21 edge functions (Deno) + _shared/ — só leitura de Graph; execução é do agente
supabase/seed.sql    admin local (só ambiente local)
supabase/roles.sql   default privileges (só ambiente local)
db/                  scripts de banco (import de dumps de produção)
agent/               Órigo Agente (Python) — executor AD/Entra
docs/                arquitetura (agente executor único), playbook do Hermes e relatórios de QA
```
