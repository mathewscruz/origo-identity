# Ajustar gráficos do Dashboard

## Objetivo

Deixar o Dashboard mais fiel e legível para operação diária:

1. O gráfico de **Provisionamento** deve mostrar o volume real de processamentos por dia, sem aparência ou cálculo acumulado.
2. Os gráficos dos anexos 2 e 3 devem deixar todas as categorias visíveis e fáceis de comparar, mesmo quando uma categoria domina o total.

## Mudanças propostas

### 1. Provisionamento diário, não acumulado

- Trocar a visualização principal de área/linha suavizada por barras diárias agrupadas ou empilhadas.
- Cada barra representará apenas os itens criados/processados naquele dia de calendário, no fuso de São Paulo.
- Manter a separação por tipo:
  - Concessão
  - Revogação
  - Outros
- Ajustar o rótulo/título para deixar claro que o gráfico mostra **processamentos por dia**.
- Evitar curvas suavizadas, pois elas podem dar a impressão visual de acumulado mesmo quando os dados são por período.

### 2. Colaboradores por Status

- Substituir o donut por uma visualização mais legível, preferencialmente barras horizontais com:
  - nome da categoria;
  - quantidade;
  - percentual do total;
  - cor semântica por status.
- Exibir todas as categorias esperadas, inclusive quando o valor for zero:
  - Ativo
  - Férias
  - Afastado
  - Inativo
  - Desligado
- Isso evita que categorias pequenas desapareçam visualmente no donut.

### 3. Eventos JML por Tipo

- Substituir o donut por uma visualização de comparação por barras/lista visual.
- Exibir todas as categorias esperadas, inclusive quando o valor for zero:
  - Joiner
  - Mover
  - Leaver
- Manter o filtro de período atual, mas deixar a leitura mais direta com valor e percentual.

## Detalhes técnicos

- Arquivo principal: `src/pages/Dashboard.tsx`.
- Alterar `useProvisioningData` para retornar buckets diários alinhados ao filtro escolhido ou, se necessário, criar uma série diária específica para a visão de provisionamento.
- Remover a renderização com `AreaChart` no Provisionamento e usar `BarChart` do Recharts, sem suavização visual.
- Alterar `useColabsByStatus` e `useEventosJmlByTipo` para não filtrarem categorias com valor zero, garantindo que todas apareçam no frontend.
- Criar uma pequena visualização reutilizável de barras categóricas para evitar repetir layout nos dois gráficos.
- Preservar as cores semânticas já usadas no Dashboard e o idioma em português.

## Validação

- Conferir no Dashboard que o gráfico de Provisionamento não mostra valores acumulados.
- Conferir que os anexos 2 e 3 passam a mostrar todas as categorias, com números e percentuais visíveis.
- Verificar responsividade para não criar rolagem horizontal.
