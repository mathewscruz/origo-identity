# Aplicar os 4 mockups aprovados

Deixar idêntico aos mockups escolhidos, mantendo menu lateral, cores teal e dados reais do sistema.

## 1. Fila de provisionamento
- Faixa de 4 números clicáveis: Na fila, Executando, Falhas (vermelho), Concluídos hoje.
- Tabela por pessoa: avatar + nome + e-mail, coluna "Progresso" com etapas Criar conta → Grupos → Licenças → Apps (verde concluído, vermelho falha, cinza pendente), selo de situação e data.
- Clicar numa linha abre painel lateral com as tentativas e o motivo da falha.

## 2. Licenças
- Abas Todos / Microsoft / Outros e ordenação.
- Cartões por licença com ícone oficial, "X de Y", barra de uso (vermelha acima de 100%) e etiqueta "Suspensa".
- Clicar no cartão abre à direita a lista de quem usa, com busca e paginação.

## 3. Aplicações
- Botão "Conectar sistema" no topo, busca e filtros (tipo, situação, ordem).
- Grade de cartões: logo, nome, selo Grupo / API / Manual, ponto de situação da conexão, Dono e Revisor com foto.

## 4. Janelas de confirmação (desligar, revogar, excluir)
- Ícone de alerta, título com o nome do alvo, texto curto e quadro "Impacto da ação" listando o que acontece (conta, grupos, licenças, aplicações) com números reais.
- Rodapé: Cancelar à esquerda, ação em vermelho à direita.

## Detalhes técnicos
- Reutilizar `MetricStrip` e `DetailPanel`; criar `ConfirmImpactDialog` compartilhado e aplicar nos desligamentos/revogações/exclusões existentes.
- Só visual: sem mudar regras, permissões ou consultas além do necessário para contar impactos.
- Conferir cada tela no navegador após a mudança.
