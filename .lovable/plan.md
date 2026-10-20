# Atualização automática ao abrir as páginas: diagnóstico e correção

## Resposta curta (estado atual, conferido no banco)
- **Não, hoje as páginas não estão disparando atualização de fato.** As telas Licenças, Aplicações, Privilegiados, Quarentena e Conexões pedem atualização ao Hermes ao abrir, mas o registro desses pedidos está **vazio**: nenhum pedido foi gravado em nenhum momento.
- **Licenças:** última atualização foi às 09:49 de hoje, feita manualmente por mim na validação — não pelo Hermes.
- **Entradas e saídas:** não dependem de sincronização da página; são contadas na hora a partir dos desligamentos/admissões executados. Mas só aparecem se a Base do RH foi importada (última importação hoje às 08:10) e o Hermes executou a fila.
- A tela mostra "Atualização automática solicitada" mesmo quando o pedido falha — isso esconde o problema.

## O que vou fazer
1. **Descobrir por que o pedido não é gravado** (abrir a página com login real e ver a resposta do pedido). A causa ainda não está confirmada.
2. **Corrigir a causa** para que cada abertura de página gere o pedido ao Hermes (respeitando o limite de 1 a cada 15 min por assunto).
3. **Mostrar a verdade na tela:** em vez de "solicitada", mostrar "Atualizado há X", "Aguardando o Hermes" ou "Não foi possível pedir atualização" quando falhar.
4. **Cobrir páginas que faltam:** Grupos/Pessoas (atualização do Entra) e o Início (pede atualização das licenças e da Base do RH em segundo plano).
5. **Conferir ponta a ponta:** abrir Licenças, confirmar o pedido registrado e ver se o Hermes o atende. Se o Hermes do servidor ainda estiver na versão antiga e não atender, aviso claramente.

## Detalhes técnicos
- Tabela `agent_tasks` com 0 linhas; RPC `agent_refresh_request` existe e tem execução para `authenticated`; `useAutoRefresh` engole erros com `.catch(() => undefined)`.
- Ajustar `useAutoRefresh` para expor `error`/`pending` e `AutoUpdatedHint` para exibir o estado; adicionar teste do estado de falha.
- Não criar agendamento no banco; o Hermes continua sendo o único executor.
