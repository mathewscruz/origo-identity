# Execuções = só entradas e saídas de pessoas

## O que muda no Início
- **Card "Execuções em N d"** passa a mostrar quantas pessoas entraram e saíram no período (ex.: "12 · 8 entradas, 4 saídas"), comparado ao período anterior. A miniatura do card segue o mesmo número por dia.
- **Gráfico "Execuções por dia"** vira "Entradas e saídas por dia": barras de Entradas e Saídas por dia, com os totais do período no topo. Concessões, revogações, falhas, licenças, grupos e as demais atividades deixam de ser contadas.
- O link do card leva à Auditoria filtrada por entradas/saídas, em vez da fila.
- Os seletores de 7, 30 e 90 dias continuam funcionando.

## Regra de contagem
- Cada pessoa conta uma vez por dia em cada tipo (entrada ou saída), no fuso de São Paulo.
- **Entrada:** conta criada e liberada de fato (RH confirmado, criação concluída no AD ou terceiro cadastrado).
- **Saída:** desligamento concluído e confirmado.
- Essa regra é a mesma do cálculo diário já usado no sistema.

## Detalhes técnicos
- Reutilizar `dashboard_people_series(p_days)` como única fonte dos números. Busca-se `2*period` dias e o resultado é dividido em período atual e anterior no cliente para obter o valor do card e o `prev`.
- Em `Dashboard.tsx`, trocar `k.execucoes`/`execucoes_prev` e o gráfico baseado em `dashboard_series` por `usePeopleSeries`. `dashboard_kpis` continua igual para os outros indicadores.
- Adicionar um teste em `src/test/` para o helper que soma entradas e saídas e divide os períodos (por exemplo, 3 entradas e 2 saídas resultam em 5).
