# Corrigir gráfico de Provisionamento (valores por dia)

## Problema

O gráfico soma os totais de forma acumulada ao longo do tempo, então a última coluna (dia atual) sempre aparece como o maior valor — não é possível ver o volume real de cada dia.

Além disso, os itens são agrupados por "idade em horas" e não por data de calendário: um item criado ontem à noite pode cair no balde de hoje, inflando ainda mais o dia atual.

## O que muda

1. **Valores por período, não acumulados**: cada ponto do gráfico passa a mostrar apenas os itens criados naquele dia (ou semana/mês/ano, conforme o filtro selecionado).
2. **Agrupamento por data de calendário**: o item é alocado no balde pela sua data real (dia/semana/mês/ano), no fuso de São Paulo, eliminando o vazamento de itens para o dia atual.
3. **Cobertura completa dos dados**: a consulta hoje retorna no máximo 1.000 registros, o que distorce períodos longos (mês/ano). Passa a buscar todos os registros do intervalo por paginação.

O restante segue igual: mesmas séries (Concessão, Revogação, Outros), mesmas cores, mesmos filtros Dia/Semana/Mês/Ano.

## Detalhes técnicos

- `src/pages/Dashboard.tsx`, hook `useProvisioningData`: remover a etapa de totais acumulados (`cA/cR/cO`) e retornar `perBucket` direto.
- Substituir `bucketFn(age)` por uma função de chave de calendário: formatar `created_at` em `America/Sao_Paulo` e mapear para a chave do balde (`YYYY-MM-DD`, semana ISO, `YYYY-MM`, `YYYY`); gerar os labels a partir das mesmas chaves para garantir alinhamento.
- `getPeriodConfig`: passar a expor as chaves dos baldes junto com os labels, em vez de `bucketFn`/`reverse`.
- Buscar as linhas de `iam_queue` em páginas de 1.000 (via `.range()`) até esgotar o intervalo.
