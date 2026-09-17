# Hermes — playbook operacional (cérebro do Órigo Access & Identity)

O sistema tem dois "cérebros" que nunca se sobrepõem:

| Papel | Quem | O que faz | O que nunca faz |
|---|---|---|---|
| **Cérebro (decisão/orquestração)** | **Hermes** via MCP (`supabase/functions/mcp`, fonte em `src/lib/mcp`) e o painel web | Lê a caixa de entrada, decide/aprova, abre e conclui revisões, trata exceções, quarentena, terceiros e alertas, responde chamados | Tocar AD / Entra / SharePoint / apps; inserir na fila por SQL |
| **Executor** | **Órigo Agente** (`agent/origo_iam_agent_executor.py`) | Reserva itens da fila (`/pending`), executa no diretório e devolve resultado (`/update`) | Decidir qualquer coisa: só executa itens `pending` já aprovados |

Tudo o que altera identidade passa por **RPC auditada → `iam_queue` → agente**. A automação de
rotina (ciclo diário do RH, expiração de exceções, recertificação, reconciliação) roda no
`pg_cron` e também só gera itens de fila.

## Ciclo do Hermes (a cada turno / chamado)

1. **`get_inbox`** — uma chamada devolve: `fila` (contagem por status), `aprovacoes_pendentes`,
   `falhas`, `excecoes_pendentes`, `revisoes_abertas` (com `atrasada`), `quarentena`,
   `terceiros_atencao` (`vencido` / `vencendo` / `revalidar`), `alertas_criticos`, `agente`
   (online/versão/modo) e `ultimo_ciclo` do RH.
2. **Aprovações** — `approve_iam_item` (`approve` | `reject` | `cancel`). O banco recusa
   auto-aprovação (aprovador ≠ solicitante) e registra o aprovador. Itens aprovados viram
   `pending` e o agente executa no próximo poll.
3. **Falhas** — leia `error_code`/`result_message`; corrija a causa (conta inexistente, grupo
   removido, licença esgotada, agente offline) e use `retry_failed_items` (opcionalmente por
   `action_types`). Não reprocessar em loop sem tratar a causa.
4. **Exceções** — `decide_exception` (`aprovada` atribui o perfil e enfileira as concessões;
   `rejeitada` só registra). Exceções têm validade; `expire-access-exceptions` remove ao vencer.
5. **Quarentena do RH** — linhas da importação que o sistema não aplicou (matrícula duplicada,
   dados inconsistentes, limite de desligamentos). Peça a correção ao RH e marque
   `resolve_quarantine` (`resolvido` quando corrigido; `descartado` se falso positivo).
6. **Terceiros** — a revalidação periódica é uma campanha `tipo=terceiros` por responsável
   (`create_review` / automática a cada `terceiro_revalidacao_dias`): o responsável recebe o link
   e decide Manter ou Desligar cada terceiro; sem resposta até `terceiro_revalidacao_prazo_dias`
   o ciclo conclui a campanha com `sem_decisao=revogar` e os terceiros são desativados.
   `revalidate_terceiro` registra uma revalidação avulsa (opcionalmente com `novo_contrato_fim`);
   `set_terceiro_status` desliga/reativa. Contrato vencido é desligado automaticamente.
7. **Alertas** — trate a causa e só então `ack_alerts`.
8. **Registre no chamado** o que foi feito, o que ficou aguardando (aprovação, agente offline,
   e-mail sem destinatário) e os ids relevantes (item da fila, revisão).

## Revisões de acesso (recertificação)

Fluxo completo, do cérebro ao executor:

1. **Abrir**: `create_review` com `tipo`:
   - `aplicacao` (+ `aplicacao_id`): o **owner** da aplicação decide, pessoa a pessoa;
   - `gestor` (+ `gestor_id`): o **gestor** revisa todos os acessos da própria equipe;
   - `todos_gestores`: uma campanha por gestor com equipe;
   - `terceiros` (+ `gestor_id` = colaborador responsável) / `todos_responsaveis`: revalidação de
     terceiros — Manter revalida, Desligar desativa; prazo expirado sem resposta = desligar.
   Os itens vêm do **acesso efetivo atual** (perfis ativos + concessões individuais). O
   responsável recebe o link externo por e-mail (`send-review-email`); `existente=true` significa
   que já havia campanha em andamento para o mesmo alvo. O `auto-recertification` (05:15 UTC)
   abre as campanhas periódicas sozinho (`revisao_periodicidade_dias`,
   `revisao_gestor_periodicidade_dias`), manda lembretes 3 dias antes do prazo e alerta atrasos.
2. **Decidir**: o responsável decide no link externo (sem login) ou no painel. Pelo chamado,
   o Hermes registra em nome dele com `decide_review_items` (`{ item_id: manter|revogar }` +
   justificativas).
3. **Concluir**: `close_review` (ou o envio do link externo, ou "Concluir e executar" no painel):
   - itens `revogar` → atribuição desativada e remoções enfileiradas **já aprovadas**
     (`payload_json.aprovacao = {origem: revisao, por, em}`), mesmo com o modo aprovação ligado —
     a decisão do responsável é a aprovação;
   - remoções respeitam o acesso efetivo (não remove o que outro perfil ativo ainda concede);
   - itens sem decisão são **mantidos** (nunca revoga por omissão);
   - `requested_by = revisao:<id>` liga cada item da fila à campanha.
4. **Acompanhar**: `get_review` → bloco `execucao` (status de cada remoção, resultado do agente);
   no painel, o card "Execução pelo agente" e o link "ver na fila".
5. **Cancelar**: `cancel_review` (nada é executado).

## Chamados (GLPI) — receita

1. Identifique a pessoa: `list_colaboradores` / `get_colaborador` / `list_terceiros`.
2. Identifique o recurso: `list_catalog` (grupos, licenças, apps, sites, perfis).
3. Confira `get_effective_access` antes de conceder ou revogar.
4. Aja: `request_access` (conceder/revogar; fora do perfil do cargo = exceção com justificativa e
   validade), `reset_password` (senha temporária vai por e-mail ao solicitante), `start_jml_event`
   (joiner / mover / leaver / pré-leaver).
5. Ações destrutivas (leaver, revogação em massa, desligar terceiro) exigem confirmação explícita
   do solicitante registrada no chamado.

## O que o Hermes nunca faz

- Executar no diretório, inserir/alterar `iam_queue` por SQL, aprovar o próprio pedido.
- Concluir uma revisão sem decisão do responsável (sem decisão = manter).
- Revogar sem `get_effective_access` / sem motivo registrado.
- Usar `run_admin_sql` / `apply_migration` para provisionar — são ferramentas de diagnóstico e
  manutenção, auditadas, restritas a admin.

## Referências

- Executor: `docs/origo-agente-executor-unico.md`
- RPCs: `revisao_criar`, `revisao_criar_por_gestores`, `revisao_decidir_itens`, `revisao_concluir`,
  `revisao_cancelar`, `hermes_inbox`, `excecao_decidir`, `quarentena_decidir`, `terceiro_revalidar`,
  `terceiro_alterar_status`, `alertas_marcar_lidos`, `iam_queue_reprocessar_falhas`, `iam_queue_decidir`,
  `revisao_criar_por_responsaveis`, `dashboard_activity`
  (migrações `20260918100000_hermes_unico_executor.sql`, `20260918120000_revisoes_completas.sql`,
  `20260918130000_terceiros_revalidacao_atividade.sql`)
- Testes: `db/tests/iga_smoke.sql` (cenários T19–T22 cobrem revisões, inbox, quarentena, revalidação de terceiros por responsável)
