# Novo módulo: Contas de Serviço

## O que você vai ver
- Novo item **Contas de Serviço** no menu (dentro de Pessoas), com lista, busca, filtros (ativa/desativada, sem dono, revalidação vencida) e ficha de detalhe.
- Cada conta tem: nome, e-mail/login, **dono responsável** (colaborador), finalidade, sistemas que usa, criticidade, data da última revalidação e situação.
- Ações (Super Admin e Suporte): criar, editar, desativar/reativar, trocar dono, revalidar. Leitor só vê.
- Revalidação a cada 90 dias; conta vencida ou sem dono gera alerta e aparece em "Precisa de você".
- Conta de serviço não segue Joiner/Leaver de RH; desativação só manual. Se o dono for desligado, a conta vira "sem dono" e gera alerta (não é desativada automaticamente).

## Migração
- Hoje há **20** terceiros marcados como empresa "Conta de Serviço". Eles serão copiados para o novo módulo (mantendo login, e-mail, acessos e histórico) e deixam de aparecer em Terceiros.
- Nenhuma conta é desativada, recriada ou alterada no Entra/AD na migração.
- Outras contas com cara de serviço (ex.: `administrativo_favela@...`) aparecem numa lista "Possíveis contas de serviço" em Terceiros para você mover com um clique.

## Ligação com o Hermes
- Ao abrir a página, pede atualização ao Hermes (mesmo padrão das demais, limite de 15 min): ele confere no Entra/AD se cada conta existe, está ativa e último login.
- Criar/desativar/reativar/resetar senha entram na fila e o Hermes executa (com aprovação quando a conta é crítica).
- Alertas (vencida, sem dono, divergência com o Entra) vão pelo Telegram do Hermes.

## Detalhes técnicos
- Tabela `contas_servico` (dono_colaborador_id, finalidade, criticidade, ultima_revalidacao, ativo, sam_account_name, email, entra_id, ultimo_login, legado_terceiro_id) com GRANTs, RLS por `has_role` (platform_admin/operador escrevem; viewer lê) e trigger de backup `iam_change_backup_trigger`.
- Coluna `conta_servico_id` em `iam_queue`, `perfil_atribuicoes`, `eventos_jml` (nullable); backfill a partir de `legado_terceiro_id`; `terceiros` marcados com `migrado_para_conta_servico` (sem apagar).
- RPCs `conta_servico_salvar`, `conta_servico_alterar_status`, `conta_servico_revalidar`, `conta_servico_mover_de_terceiro`; enqueue reutiliza `iam_queue_insert` com `target_identity` da conta.
- Nova task Hermes `sync-service-accounts` na allowlist (iam-agent-api e MCP `run_agent_tasks`), via `agent_refresh_request`/`useAutoRefresh`.
- Rótulos/ícones novos em `activityLabels.ts` + testes (revalidação 90 dias, dono desligado não desativa conta).
