# Corrigir bloqueio da sincronização e acompanhamento do RH

## Verificação

- **Apontamento 1 confirmado:** a verificação antecipada de hashes impede que o watchdog alcance um job `running` abandonado. O índice existente também bloqueia permanentemente conteúdos antigos concluídos, inclusive quando o RH retorna a uma versão anterior. A consulta somente leitura encontrou 13 jobs com hash, todos `done`; não há job com hash atualmente travado em `running`.
- **Apontamento 2 parcialmente confirmado:** os links “Base do RH” e “RH em quarentena” continuam levando a uma página sem acompanhamento do RH. A remoção dos comandos manuais foi intencional e está protegida por um teste; não restaurar importação, reconciliação ou ciclo diário como resposta automática ao apontamento. O motor ainda insere ausências informativas na quarentena a cada importação real.
- A última compilação registrada da prévia, em 20/10/2026 às 11:58:02 UTC, está sem erros.

## 1. Recuperação segura da sincronização

- Permitir nova tentativa depois de uma execução interrompida, sem aceitar duas importações concorrentes.
- Ignorar conteúdo apenas quando corresponde à última importação real concluída, não a qualquer versão histórica. Uma sequência A → B → A deverá importar A novamente.
- Preservar os jobs concluídos como histórico, com seus hashes e metadados originais.
- Manter o tratamento de conflito `23505`, distinguindo concorrência válida de execução abandonada, sem apresentar um job antigo como resultado de uma nova importação.
- Separar pré-visualizações das importações reais: uma pré-visualização não poderá bloquear uma importação nem alterar pessoas, fila ou marcador da última importação.

## 2. Acompanhamento do RH em Integrações

- Acrescentar acompanhamento somente leitura da coleta/importação: arquivo, horário, situação, progresso, quantidades e erro integral quando houver.
- Exibir a quarentena com busca e paginação, incluindo motivo, pessoa, matrícula e execução de origem; fazer os links existentes do dashboard chegarem ao acompanhamento correspondente.
- Não restaurar os botões removidos de importação manual, ciclo diário ou reconciliação.
- Auditar a decisão de quarentena existente antes de expor qualquer comando. Permitir encerramento de pendências apenas se a operação não modificar identidades nem disparar provisionamento; caso contrário, manter somente leitura e apresentar o bloqueio.
- Evitar novas pendências repetidas de ausência para a mesma pessoa enquanto já houver uma pendência aberta. Não excluir nem encerrar automaticamente registros existentes; ausência continuará sem autorizar desligamento.

## Detalhes técnicos

- Criar uma **nova migration**, sem editar nem reaplicar `20260930203000_sharepoint_sync_source_idempotency.sql`, para substituir a unicidade histórica `running/done` por uma reserva transacional de execução ativa.
- Centralizar a reserva e recuperação no caminho compartilhado de `processCsvColab`, também utilizado pelo upload. A reserva deve serializar importações RH, verificar heartbeat e recuperar apenas leases expirados de forma atômica. Vincular atualizações de progresso/conclusão à propriedade da reserva para impedir que uma execução antiga continue gravando após perder seu lease.
- Preservar hashes dos jobs históricos. Atualizar o marcador da última importação real junto à conclusão, evitando a janela entre job `done` e gravação do marcador.
- Reutilizar consultas e componentes existentes para o acompanhamento, com atualização automática e restrições de acesso vigentes. Não ampliar permissões.
- Registrar as decisões estruturais em `AGENTS.md` durante a implementação.

## Validação

- Testar comportamento com armazenamento isolado: job ativo recente, lease expirado, concorrência pelo mesmo hash e por hashes diferentes, sequência A → B → A, repetição imediata de A, corrida `23505` e pré-visualização seguida de importação.
- Testar que ausências não alteram status nem criam ações de desligamento, e que uma ausência já pendente não gera outra pendência.
- Testar o acompanhamento com estados de progresso, erro e quarentena, preservando a ausência de comandos manuais proibidos.
- Validar a navegação do dashboard até o acompanhamento em uma sessão autenticada, sem executar importação ou decisão em produção.
- Após os testes e a verificação da compilação, publicar somente as funções afetadas e registrar o resultado dos apontamentos.

## Proteções

Esta aprovação autoriza somente a nova migration necessária à correção de idempotência e a publicação das funções afetadas. Não autoriza migrations antigas pendentes, importação RH real, execução de `reconcile-identities`, reprocessamento da fila, alterações de identidades nem limpeza de histórico. Se a proteção transacional depender de requisitos incompatíveis com o banco atual, parar e apresentar o impedimento antes de executar alterações.

Nenhum código da aplicação, dado de produção, migration ou função publicada foi alterado nesta verificação.