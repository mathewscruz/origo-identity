# Integração IAM x Hermes Agent: análise e melhorias

## Situação atual (dados reais de produção)

- **Agente online e executando**: o servidor VM-VSVR037-HERMES manda sinal a cada poucos segundos, em modo de execução real.
- **Versão diferente do repositório**: o agente em produção roda a versão `compat-redesign-20260917.1`, mas o executor guardado no projeto é a `2.0.0`. Não há garantia de que o código do projeto é o que roda no servidor.
- **"Último resultado" vazio**: o painel nunca mostra o que o agente executou por último.
- **Fila dos últimos 30 dias**: 451 sucessos e 0 falhas. Há 152 cancelamentos, a maioria por política, e cada um tem um código técnico (`policy_no_ad_mutation`, `user_not_in_entra_noop`, `license_mutually_exclusive_policy_conflict`...) que a tela não explica.
- **Rotinas agendadas**: desde a mudança de hoje dependem do Hermes. Ninguém conferiu se a agenda está ligada no servidor; se estiver desligada, exceções, recertificação e o ciclo do RH não rodam.
- **Ações não suportadas**: criar, alterar ou desabilitar usuário dentro de aplicações (create/update/disable/delete_user_app) ficam bloqueadas no agente.
- **Sem controle pela tela**: não dá para pausar o agente, ver o histórico de execuções dele nem disparar uma rotina pelo sistema.

## Melhorias propostas

### 1. Central do Hermes (nova aba em Configurações)
- **Status**: online/offline, versão, servidor, modo (real ou simulação), último sinal e último resultado.
- **Agenda**: horário de cada rotina, último disparo e se deu certo. Aviso em vermelho quando uma rotina não roda há mais de 26 h.
- **Botão "Executar agora"** por rotina. Fica registrado na auditoria e é executado pelo Hermes, nunca pelo navegador.
- **Botão "Pausar agente"** (só administradores): o agente para de pegar itens novos e continua mandando sinal. É o botão de emergência.

### 2. Disparos pela tela continuam passando pelo Hermes
- "Executar agora" cria um pedido numa lista de tarefas.
- O Hermes busca essas tarefas no mesmo ciclo em que busca a fila.
- Mantém a regra de que o sistema não executa nada sozinho.

### 3. Resultado claro de cada item
- Os códigos de cancelamento viram frases em português na fila. Exemplos:
  - "Usuário não existe no Entra, nada a fazer."
  - "Política: sem alteração no AD."
  - "Conflito de licenças."
- Cada item mostra o que o agente encontrou antes e depois (evidência), quando o agente enviar essa informação.

### 4. Alertas de operação
- Alerta crítico no sino quando o agente fica mais de 30 min sem sinal.
- Alerta quando um item fica mais de 1 h reservado sem resposta, além da devolução automática que já existe.
- Alerta quando a versão do agente não é a esperada.

### 5. Consistência de versão
- Parâmetro "versão esperada do agente". O painel mostra se a versão em produção bate com ele.
- Recomendação para vocês: subir para o repositório o código que roda em produção (`compat-redesign`), para o projeto refletir a realidade.

### 6. Fora deste plano (decisão de vocês)
- Suporte do agente a usuários dentro de aplicações (create/update/disable_user_app). Depende de cada aplicação ter integração própria.

## Detalhes técnicos
- Tabela `agent_tasks` (id, task, status, requested_by, created_at, started_at, finished_at, http_status, result), com GRANT, RLS e Realtime. A escrita do frontend é feita por RPC `agent_task_solicitar` (admin/operador, task na allowlist).
- `iam-agent-api`:
  - `GET /pending` passa a devolver também `tasks` pendentes e o parâmetro `agent_paused`.
  - Novo `POST /task_result`.
  - `run_task` continua para a agenda local.
- Parâmetros novos: `agent_paused` (bool) e `agent_expected_version`.
- O heartbeat grava `last_result` também em `/update`, o que corrige o campo vazio.
- `process` dos códigos: mapa `FAILURE_LABELS` ampliado com todos os `error_code` vistos.
- Alertas: função `iam_agent_health_check()` chamada no próprio `/pending` e no `/health` (sem cron). A ausência de sinal é detectada no frontend pelo hook `useAgentStatus` e no próximo contato do agente.
- Executor Python: honrar `agent_paused`, consumir `tasks` e reportar `task_result`. Será entregue como diff para aplicar sobre a versão `compat-redesign` do servidor.
- Nenhuma mudança em identidades, fila existente ou regras de aprovação.
