# Sugestões visuais por tela e janela

Padrão base (já aplicado em Início e Colaboradores): faixa de números clicáveis no topo, lista enxuta, painel lateral de detalhe ao clicar, cores só para situação.

## Telas

| Tela | Sugestão |
|---|---|
| Terceiros | Mesmo padrão de Colaboradores. Faixa: Ativos, Revalidação vencendo (45 dias), Vencidos, Sem gestor. Painel com empresa, responsável, data de revalidação em destaque e barra de prazo. |
| Contas de serviço | Faixa: Ativas, Sem dono, Revalidação vencendo, Desabilitadas. Etiqueta amarela "Sem dono" na linha. Painel com dono, finalidade, última verificação do Hermes. |
| Fila de provisionamento | Linha do tempo por pessoa (Criar conta → Grupos → Licenças → Apps) em vez de tabela plana. Faixa: Na fila, Executando, Falhas, Concluídos hoje. Falha abre painel com motivo em português e próximo passo. |
| Eventos JML | Três colunas Entrada / Mudança / Saída com cartões compactos; contador por coluna. |
| Licenças | Cartões por produto com ícone, barra "usadas de contratadas" (vermelha acima de 100%) e etiqueta "Suspensa". Painel lateral lista quem usa. |
| Aplicações | Grade de cartões com logo, forma de acesso (Grupo / API / Manual), dono, revisor e ponto de situação da conexão. Botão "Conectar sistema" fixo no topo. |
| Perfis de acesso | Lista à esquerda, à direita o conteúdo do perfil em blocos: Grupos, Licenças, Aplicações, Cargos ligados. |
| Acessos privilegiados | Faixa: Funções críticas, Pessoas com privilégio, Permanentes vs. temporários. Linhas com selo de risco. |
| Conflitos (SoD) | Cartão por conflito mostrando "Acesso A × Acesso B" lado a lado e a pessoa; severidade por cor lateral. |
| Exceções | Abas Pendentes / Aprovadas / Vencidas com barra de prazo (15 dias em amarelo). |
| Revisões de acesso | Cartões de campanha com anel de progresso (% revisado), revisor e prazo. Dentro: itens agrupados por pessoa com botões Manter / Remover. |
| Auditoria | Feed cronológico agrupado por dia, mesmos ícones da Atividade recente, filtros em chips (Quem, Ação, Período). |
| Alertas | Lista estilo caixa de entrada: severidade por cor lateral, não lidos em negrito, "Marcar como lido" ao passar. |
| Relatórios | Grade de cartões por relatório com prévia de número e botão Baixar. |
| Configurações | Abas atuais com conteúdo em blocos de formulário de largura fixa, rótulo à esquerda e explicação curta abaixo. Hermes: cartão de estado grande com última execução. |
| Login | Tela dividida: marca Órigo à esquerda em teal, formulário simples à direita. |

## Janelas (popups)

- **Confirmações (excluir, desligar, revogar):** ícone de alerta, título com o nome do alvo, resumo do impacto em lista ("Remove 4 grupos, 2 licenças"), botão vermelho à direita.
- **Formulários de cadastro (colaborador, terceiro, conta de serviço):** viram painel lateral em vez de janela central, com seções numeradas e botão Salvar fixo no rodapé.
- **Conectar sistema:** tela cheia em duas colunas (conversa à esquerda, ficha à direita) com passos no topo: Dados → Acesso → Perfis → Revisar.
- **Análise do Hermes:** cartões por item encontrado com caixa de seleção e selo "Sugerido pelo Hermes".
- **Detalhe de falha da fila:** painel lateral com linha do tempo das tentativas e mensagem clara.
- **Padrão geral:** mesma largura (sm/md/lg), cabeçalho com ícone + título + subtítulo, rodapé Cancelar à esquerda e ação principal à direita.

## Ordem de execução sugerida
1. Terceiros e Contas de serviço (reaproveitam Colaboradores).
2. Fila, Licenças, Aplicações.
3. Riscos (Privilegiados, SoD, Exceções), Revisões, Auditoria, Alertas.
4. Padronização de todas as janelas.
5. Configurações, Relatórios, Login.

## Detalhes técnicos
- Reutilizar `MetricStrip` e `DetailPanel`; criar `ConfirmImpactDialog` e `FormSheet` compartilhados.
- Somente camada visual; sem mudança de regras, permissões ou dados.
- Verificar cada tela com Playwright após a mudança.
