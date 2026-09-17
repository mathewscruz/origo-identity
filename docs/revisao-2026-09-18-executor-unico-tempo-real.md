# Revisão 2026-09-18 — executor único, limpeza de testes, tempo real e dashboard

Escopo pedido: (1) só o Hermes/Órigo Agente executa; (2) remover opções criadas na fase de
teste; (3) validar módulos/fluxos e integrações; (4) números reais em tempo real; (5) visual e
dashboard; (6) remover código morto — backend e frontend em sincronia.

## 1. Executor único (Hermes / Órigo Agente)

| Antes | Agora |
|---|---|
| `process-iam-queue` executava Graph/SharePoint/apps quando `iam_execution_mode = lovable_cloud`; a UI disparava `triggerEntraProcessing` a cada ação; cron `origo-process-queue` a cada 15 min | Função **apagada**. Nenhuma edge function escreve em AD/Entra/SharePoint/apps (só há GETs no Graph: catálogo, base do RH, reconciliação, acesso real). `triggerEntraProcessing`, o parâmetro `iam_execution_mode` e o job foram removidos |
| `reset-entra-password` trocava senha via Graph e devolvia a senha ao navegador | Função **apagada**. Reset vira item `reset_password` (RPC `iam_enqueue_reset_password`: conta privilegiada exige admin; um por conta). O agente executa (AD via LDAPS ou Entra) e devolve `secret`; a API entrega por e-mail ao solicitante (`senha_temporaria`) e **nunca persiste** — se o e-mail falhar, o item fica `failed/secret_delivery_failed` |
| Cadastro manual de colaborador/terceiro montava itens `create/update/update_entra` no navegador com senha fixa no payload | RPCs `colaborador_salvar` / `terceiro_salvar`: conta AD (sem senha; o agente define a inicial), perfis do cargo com carência de 45 min para a replicação AD→Entra, atributos no diretório, mudança de status via `jml_alterar_status`/`terceiro_alterar_status`, eventos JML — tudo numa transação |
| Revogação individual inseria `remove_*` direto | RPC `iam_revogar_individual`: recusa se um perfil ativo ainda concede; bloqueia grupos on-prem/dinâmicos/privilegiados |
| Decisão de exceção com 5 escritas no navegador | RPC `excecao_decidir` (anti-auto-aprovação, atribuição por exceção, enfileira pelo acesso efetivo) |
| Reconciliação em dois lugares (`process-iam-queue reconcile-create` e `reconcile-identities`) | Uma só: `reconcile-identities` absorveu o cancelamento de criações abertas (já existe no Entra / desligado) e a detecção de contas órfãs |
| `run-daily-cycle` chamava o executor; `expire-access-exceptions` idem | Ambos só enfileiram; o ciclo termina reportando quantos itens ficaram para o agente |
| Agente sem sinal de vida | Heartbeat em cada chamada (`X-Agent-Version/Host/Execute` → `iam_agent_status`); dashboard, fila e integrações mostram online / sem sinal / offline, versão, modo e último resultado |
| Hermes sem caminho seguro para chamados do GLPI | Tools MCP novas: `request_access` (conceder/revogar perfil, grupo, licença, app, SharePoint → fila com aprovação), `reset_password`, `list_catalog`, `get_effective_access`. `invoke_edge_function` limitado às funções de sincronização/orquestração |

Agente v2.0.0 (`agent/origo_iam_agent_executor.py`): `reset_password` (LDAP `modify_password` + `pwdLastSet=0`, ou Graph `passwordProfile`), heartbeat, `secret` no `/update`.

## 2. Opções da fase de teste removidas

- **Modo Simulação / Produção** (`modo_operacao`): parâmetro, banner amarelo, card em Parâmetros, checagens em `iam-agent-api`, CSV e cron. O sistema é sempre produção; o único "dry-run" que sobrou é o do próprio agente (`--execute`) e a **pré-visualização** do CSV (não grava nada) — ambos operacionais, não de teste.
- **Limpar Base Completa** (purga de todos os colaboradores) — botão removido; a purga por platform_admin continua existindo só como RPC auditada.
- Parâmetros do scaffold que nada lia: `max_tentativas_jml`, `aprovacao_dupla_leaver`, `importacao_automatica` (2Easy), `dias_alerta_contrato`, `iam_execution_mode`.
- **Dados de demonstração** da migration inicial (Ana Silva, SecureIT, SAP ERP, Jira, Slack, Datadog, "Revisão Q1 2026", regras…): a migration `20260918100000` apaga exatamente esses UUIDs fixos (colaboradores só se o e-mail for `@origo.com`; apps só se não vierem do Azure) e registra na auditoria.
- Tabelas nunca escritas (`evento_jml_acoes`, `evento_jml_aprovacoes`) e funções órfãs (`cleanup_expired_iam_change_backups`, `iam_backup_actor`, `has_any_app_role`); `iam_change_backups` só se estiver vazia.
- Eventos JML deixam de ter "status/quarentena/aprovar/reprocessar" cosméticos: são um log imutável ligado às ações da fila.

## 3. Módulos e fluxos (validação)

| Módulo | Situação | Ajuste |
|---|---|---|
| Dashboard | números vinham de 6 consultas parciais, sem SoD/licenças/terceiros | RPC `dashboard_metrics()` + `dashboard_series()`; ver §5 |
| Aprovação IAM | reconciliação apontava para o executor apagado; sobreposição com a Fila ("Histórico" = Fila filtrada) | usa `reconcile-identities`; **virou a aba "Aguardando aprovação" da Fila** (`/aprovacao-iam` redireciona); filtros por URL (`?q=`, `?action=`) |
| Fila | 1 000 linhas no cliente, contadores errados, "Processar fila" | paginação/filters no servidor, `iam_queue_stats()`, reprocessar falhas em lote, cancelar, status completos, agente online/offline |
| Colaboradores | criação/edição no navegador, senha fixa, "Editar" recarregava a página, sem gestor | RPC, gestor direto, motivo obrigatório para desligar, `?edit=` sem reload, "Excluir" = desligar |
| Terceiros | desativar/reativar inline duplicado em 200 linhas de cliente; "excluir" apagava | RPC + trigger `terceiros_soft_delete` (identidades nunca são apagadas); `accountExpires` com o fim do contrato; KPIs de vencimento |
| Eventos JML | ações de status sem efeito | log com resumo, filtros, KPIs por pessoa; detalhe mostra as ações da fila e permite reprocessar falhas |
| Exceções | decisão sem anti-auto-aprovação | RPC `excecao_decidir` |
| Integrações | "Processar fila", "Limpar base", site/pasta fixos no texto, quarentena invisível | status do agente, ciclo/CSV/reconciliação com progresso, **quarentena com decisão**, pré-visualização de CSV, parâmetros do SharePoint lidos do banco |
| Parâmetros | 4 campos (3 mortos) e modo simulação | todos os parâmetros reais, tipados e explicados, com agenda do pg_cron e último disparo |
| Auditoria | carregava a tabela inteira no navegador | paginação/busca/filtros no servidor; exporta até 5 000 |
| Relatórios, SoD | carregavam uma vez; Relatórios repetia Fila ("Histórico") e reconciliação ("Contas órfãs") | recarregam quando as tabelas mudam (`useDbChange`); ficaram só "Quem tem acesso a quê" e "Acessos excessivos" |
| Solicitações / Workflow / Portal de self-service | segundo sistema de pedidos e aprovação, paralelo ao GLPI→Hermes→Fila e às Exceções; motor de workflow no navegador | **removidos** (migration `20260918110000`: 6 tabelas, `licencas_catalogo`, KPI do dashboard, 2 templates de e-mail). Papéis: `viewer` passou a ser somente leitura no painel (políticas de SELECT) e `platform_admin` herda `admin` (has_role hierárquico) |

Integrações possíveis identificadas: Hermes/GLPI via `request_access`/`reset_password` (feito);
SendGrid é obrigatório para o reset de senha; `terceiro_revalidacao_dias` e `terceiro_email_dominio`
agora são parâmetros.

## 4. Tempo real

- Uma assinatura Postgres Changes para o schema inteiro (`useRealtimeSync`) invalida o cache do
  react-query por prefixo de chave (`TABLE_KEY_PREFIXES`); tabela sem mapeamento invalida tudo.
- Todas as leituras de números passaram a ser `useQuery` (dashboard, fila, alertas/sino, auditoria,
  detalhe da fila, quarentena, agente, jobs). Páginas com fetch próprio usam `useDbChange`.
- Sem polling para números (só reforço de 3 s enquanto um job de importação está `running`).
- `iam_agent_status` e `iam_queue` entram na publicação `supabase_realtime`.
- Verificado: inserção via SQL de alerta e item da fila refletiu no dashboard, sino e atividade sem recarregar.

## 5. Visual e dashboard

- Componentes padrão `PageHeader` e `StatCard`; cabeçalhos unificados; header fixo com blur; rótulos
  e cores únicos para fila/JML/status (`src/lib/queueLabels.ts`).
- Dashboard: faixa de status do sistema (agente, ciclo diário, última base do RH, aprovação
  obrigatória), 6 KPIs com contexto (mais antigo aguardando, sucesso 24 h…), série de área da fila
  (concessões / revogações / contas / falhas, 7/30/90 dias, legenda clicável, tempo médio
  aprovação→execução), barras JML por dia, pessoas por status e fila por status (clicáveis), ações
  dos 7 dias com taxa de sucesso e falhas por causa, **pendências de governança** (exceções
  vencendo, revisões atrasadas, terceiros vencidos/a revalidar, SoD, licenças críticas, órfãos,
  quarentena, ativos sem Entra/cargo, privilegiados), atividade recente (fila + JML).

## 6. Código morto removido

Frontend: `triggerEntraProcessing`, `ModoOperacaoBanner`, `useModoOperacao`, `MatrizPage` (sem rota),
`types/iamQueue.ts`, `lib/iam/{index,enqueue,diffResources,resolveProfileResources,queueTypes}`,
`useEffectiveAccess` (hook antigo), `useColabActivation`, `createEventoJML`, `provisionCargoAcessos`,
`useEventoQueue`, `useJmlEvent`, `QueueTable`/`EventosJMLTable`, 19 componentes shadcn nunca
importados, exports órfãos, `example.test.ts` (substituído por testes reais).
Backend: `process-iam-queue`, `reset-entra-password`, helpers de erro do Graph, parâmetros/tabelas/
funções listados no §2, job `origo-process-queue`.

## Verificação

- `supabase db reset` do zero · `db/tests/iga_smoke.sql` **21/21** (9 cenários novos) · 21 functions sobem
- `tsc` · `vitest` (4 testes) · `vite build` · eslint sem erros nos arquivos novos
- API do agente: claim → `/update` com `secret` → entrega por e-mail (falha controlada sem SendGrid local)
- Navegador: todas as rotas sem erro de console; criação de colaborador, reset de senha e realtime testados

## 7. Rodada 2 — Hermes cérebro, revisões completas e visual (mesma data)

**Revisões de acesso (backend)** — migration `20260918120000_revisoes_completas.sql`:
- `revisao_itens` ganha tipo (perfil | individual), `resource_key`, recurso/cargo/área, quem decidiu e
  `executado_em`; `revisoes` ganha `gestor_id`, lembrete, conclusão, resultado, criador e FK para
  `aplicacoes` (nunca existiu — embeds falhavam); contadores por trigger.
- RPCs `revisao_criar` (aplicação/owner ou gestor/equipe; itens do acesso efetivo: perfis + concessões
  individuais), `revisao_criar_por_gestores`, `revisao_decidir_itens`, `revisao_concluir`,
  `revisao_cancelar`, `iam_resolve_email`.
- **Pré-aprovação**: `revisao_concluir` marca `origo.pre_approved` (setting transacional) e o gate da
  fila deixa as remoções em `pending` com `approved_at` + `payload_json.aprovacao` mesmo com
  `iam_approval_required = true` — a decisão do responsável é a aprovação; `requested_by = revisao:<id>`.
  Sem decisão = mantém. Remoções respeitam o acesso efetivo.
- `hermes_inbox()`, `terceiro_revalidar`, `quarentena_decidir`, `alertas_marcar_lidos`;
  `terceiros.revalidacao_notificada_em` (a notificação deixou de contar como revalidação);
  parâmetro `revisao_gestor_periodicidade_dias`.
- `save-external-review` (decide + conclui + e-mail), `send-review-email` (gestor/owner, prazo),
  `auto-recertification` (campanhas por app e por gestor, lembretes ≤3 dias, alerta de atraso,
  terceiros vencidos, revalidação por alerta/e-mail). Smoke T19–T21.

**Revisões (frontend)**: `/revisoes` (KPIs, filtros, nova campanha por aplicação / gestor / todos os
gestores), `/revisoes/:id` (decisão item a item ou em lote, justificativa, "Concluir e executar",
cancelar, link externo, painel "Execução pelo agente" em tempo real, link para a fila filtrada) e
`/revisao-externa/:token` (owner/gestor sem login; funciona também logado). Verificado no navegador:
campanha por gestor → decisão pelo link externo → `remove_app` pendente já aprovado → agente
(simulado) concluiu → painel atualizou sem recarregar.

**Hermes cérebro (MCP 0.4.0)**: `get_inbox`, `list_reviews`/`get_review`/`create_review`/
`decide_review_items`/`close_review`/`cancel_review`, `decide_exception`, `resolve_quarantine`,
`ack_alerts`, `revalidate_terceiro`, `set_terceiro_status`, `retry_failed_items`; instruções com o
ciclo operacional; [docs/hermes-playbook.md](hermes-playbook.md). Bundle regenerado.

**Visual**: sidebar nova (marca + ambiente, busca Ctrl K, contadores em tempo real nos itens, estado do
agente, cartão do usuário com papel e menu), paleta de comandos (`CommandPalette`: páginas, ações e
busca de colaboradores/terceiros/apps/perfis), header com breadcrumb + busca + sino + menu da conta,
selo "somente leitura" para viewer, login redesenhado (erros inline, mostrar senha, loading), toasts
unificados no Sonner (adaptador em `hooks/use-toast.ts`; `ui/toast(er)` removidos), sino e página de
Alertas reescritos (`lib/alertLabels.ts`, RPC `alertas_marcar_lidos`), Auditoria e Alertas viraram
páginas de topo (`/auditoria`, `/alertas`; caminhos antigos redirecionam), `EmptyState` com título/
ícone/ação, `invokeFunction` mostra o erro real das edge functions.

**Outros**: quarentena decide via `quarentena_decidir`; terceiro com "Revalidar / Renovar" real
(`terceiro_revalidar`) e "Editar" funcional; `?new=1`/`?edit=` nas listas.

Verificação da rodada: `db reset` limpo · smoke **21/21** · tsc · vitest · build · functions alteradas
respondem · fluxo de revisão ponta a ponta no navegador.

## 8. Rodada 3 — rótulos, revalidação de terceiros e atividade recente

**Rótulos** (`src/lib/labels.ts`, `humanize()`): todo status/tipo/origem/severidade sai com inicial
maiúscula e sem código (`waiting_approval` → "Aguardando aprovação", `tecnico` → "Técnico",
`status_status` → "Status status"); dicionário para todos os enums do banco + fallback snake_case →
texto limpo; `actionLabel`/`statusLabel` caem nele. Aplicado em auditoria, aplicações, licenças,
SoD, terceiros, colaboradores, perfis, palette, popover de atividade, revisões (interno e externo),
badges soltos ("terceiro", "prazo", "ver na fila", "somente leitura", "tempo real"…). Testes em
`src/test/labels.test.ts`.

**Revalidação de terceiros pelo responsável** — migration `20260918130000_terceiros_revalidacao_atividade.sql`:
- Campanha de revisão `tipo = 'terceiros'` por responsável (`revisao_criar` com `p_gestor_id` =
  colaborador responsável ou `p_responsavel` texto; `revisao_criar_por_responsaveis` abre uma por
  responsável com terceiros vencidos). O responsável recebe e-mail com o link externo e decide
  **Manter** (revalida: `ultima_revalidacao = hoje`) ou **Desligar** (`terceiro_alterar_status`,
  contas/acessos removidos pelo agente, já aprovados).
- Parâmetros: `terceiro_revalidacao_dias` (periodicidade) e **`terceiro_revalidacao_prazo_dias`**
  (prazo de resposta; padrão 7). `revisao_concluir(..., p_sem_decisao := 'revogar')` trata itens sem
  resposta como desligar; o `auto-recertification` faz isso para campanhas de terceiros com prazo
  vencido (só quando havia e-mail de responsável) e avisa por e-mail (`terceiros_desativados_prazo`).
  Sem responsável com e-mail: campanha não nasce, alerta `terceiro_sem_responsavel`.
- Coluna `terceiros.revalidacao_notificada_em` removida (a campanha é o registro). UI: tipos
  "Terceiros" / "Todos os responsáveis" na nova campanha, vocabulário Manter/Desligar nas telas
  interna e externa, Parâmetros com o novo prazo. Smoke T22. MCP `create_review` aceita
  `terceiros` / `todos_responsaveis`; `close_review` aceita `sem_decisao`.

**Atividade recente** — RPC `dashboard_activity(p_limit, p_categoria)` une auditoria + fila + eventos
JML (categorias pessoa / acesso / catálogo / sistema, link para a entidade) e o componente
`ActivityFeed` no dashboard (filtros, "mostrar mais", tempo real). Trigger
`perfil_atribuicoes_audit` registra toda atribuição/revogação de perfil (UI, RPC, jobs) com o operador
logado (`origo.operador` ou `auth.uid()`); `logAuditoria` passou a gravar o e-mail do usuário em vez
de "sistema"; duplicatas do front removidas. Cobertura: criação/edição/desligamento de colaboradores e
terceiros (RPCs), perfis (trigger), grupos/licenças/apps/SharePoint (itens da fila com pessoa e
recurso), exceções, revisões, JML, importação do RH, catálogo.

Verificação: `db reset` limpo · smoke **22/22** · tsc · vitest (6) · build · fluxo de revalidação
ponta a ponta (job cria campanha → prazo vencido → job desliga os dois terceiros com `disable`/
`disable_entra` pré-aprovados) · feed no navegador.

## 9. Rodada 4 — usuários do painel, página do colaborador e deploy

**Usuários do painel** (`/admin/usuarios`): desativar/excluir "não fazia nada" porque `profiles` só tinha
política de UPDATE para a própria linha — o update de outro usuário afetava 0 linhas e a UI dizia
"desativado". Correção: migration `20260918140000_admin_usuarios_atividade_pessoa.sql` (política
"Admins can update profiles", RPC `admin_usuarios_resumo` com papel efetivo, último acesso e
bloqueio) + edge function **`admin-users`** (substitui `admin-create-user`) com ações `list`,
`create`, `update` (nome/papel), `set_active` (profiles.ativo + **ban no Auth** — login recusado na
hora, sessões caem), `delete` (`auth.admin.deleteUser`) e `reset_password`. Guardas: nunca contra si
mesmo, nunca o último admin ativo, platform_admin só por platform_admin; auditoria com o e-mail de quem
operou. `AuthContext` usa o papel mais alto, derruba a sessão de conta desativada (na carga e em tempo
real) e reflete troca de papel sem F5. Tela nova: KPIs, "Sua conta", filtros, papel com descrição, último
acesso, menu de ações, confirmações (excluir exige digitar o e-mail).

**Página do colaborador** reescrita: cabeçalho com avatar por status, badges (suspensão, desligado
manual, Entra vinculado/sem conta), fatos copiáveis (e-mail, login AD, matrícula, gestor com link,
admissão, origem), ações unificadas (status, "Atribuir acesso", menu "Mais": sincronizar, resetar senha,
evento JML, editar; "Suspender"/"Reverter"), KPIs clicáveis (perfis, acessos diretos, fila do agente,
funções privilegiadas, eventos JML) e abas Visão geral / Acessos / Privilegiados / Histórico JML /
**Atividade** (feed da pessoa — `dashboard_activity` ganhou `p_colaborador_id`/`p_terceiro_id`).
`?tab=` na URL. Viewer vê tudo sem botões de operação.

Verificação: `db reset` limpo · smoke 22/22 · tsc · vitest 6 · build · no navegador: criar, desativar
(login recusado "User is banned"), reativar, trocar papel e excluir usuário; página do colaborador.

## Para produção (além do README)

1. Publicar o agente v2.0.0 e garantir `SENDGRID_API_KEY` no projeto (reset de senha depende).
2. Remover no Lovable Cloud as functions `process-iam-queue`, `reset-entra-password` e
   `admin-create-user` (virou `admin-users`). Roteiro completo: `docs/deploy-producao.md`.
3. Conferir que as credenciais Azure das edge functions tenham só permissões de leitura
   (as de escrita ficam no host do agente).
