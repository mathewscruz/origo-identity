# Fazer o Hermes atender os pedidos de atualização + cobrir Início e Pessoas/grupos

## Problema
- O Hermes do servidor (versão de setembro) não lê os pedidos de atualização. Mas ele **já fala com o painel pelo canal do assistente (MCP)** — os registros mostram ele conectado várias vezes por hora.
- Início e Pessoas/grupos não pedem atualização ao abrir.

## O que muda

### 1. Pedidos entregues ao Hermes pelo canal que ele já usa
Adicionar ao canal MCP três ferramentas novas, com descrições que dizem ao Hermes quando usar:
- **Ver pedidos pendentes** — lista os pedidos de atualização e avisos (alertas) ainda não atendidos.
- **Executar pedido** — o próprio painel roda a atualização pedida (licenças, aplicações, grupos, sites, perfis, triagem da quarentena, auditoria), só da lista permitida, e marca o pedido como concluído ou com falha e o motivo.
- **Marcar aviso como enviado** — depois que o Hermes manda o aviso no Telegram dele.

Assim o Hermes atual atende os pedidos sem precisar ser reinstalado. Continua valendo: o painel não agenda nada sozinho, a pausa do agente bloqueia também essas ferramentas, e no máximo 1 pedido a cada 15 min por assunto.

### 2. Destravar os 3 pedidos parados
Conferir o estado deles; os que ficaram "em execução" sem resposta há mais de 30 min voltam a pendentes automaticamente quando o Hermes consultar (nunca apaga).

### 3. Início e Pessoas/grupos pedem atualização ao abrir
- **Início:** pede atualização de licenças e grupos, com a mesma linha discreta "Atualizado há X / Aguardando o Hermes".
- **Pessoas (Colaboradores, Terceiros) e Grupos:** pedem a atualização de grupos do Entra.

### 4. Validar
- Abrir as páginas e confirmar que os pedidos são criados.
- Chamar a ferramenta nova como o Hermes faria e confirmar que o pedido vira "concluído" e a data "Atualizado há" muda na tela.
- Testes automáticos para: só tarefas permitidas executam; agente pausado não executa; pedido parado volta a pendente.

## Fora do escopo
- Nada de criar/desativar pessoas, reprocessar a fila ou importar o RH manualmente (a importação do RH continua só pelo pedido do Hermes).

## Detalhes técnicos
- `supabase/functions/mcp/index.ts`: tools `list_agent_tasks`, `run_agent_task` (allowlist igual à do `iam-agent-api`, invoca a edge function correspondente com service role, atualiza `agent_tasks` status/finished_at/result/error, respeita `parametros.agent_paused`, claim condicional `status=pending`), `list_pending_notifications` + reaproveitar `ack_alerts`.
- Lease: em `list_agent_tasks`/`GET /pending`, `running` com `started_at < now()-30min` → `pending`.
- `useAutoRefresh` em `Dashboard.tsx`, páginas de Colaboradores, Terceiros e Grupos.
- Atualizar `AGENTS.md`: o MCP é o segundo caminho de entrega de `agent_tasks` ao Hermes.
- Republicar `mcp` e `iam-agent-api`.
