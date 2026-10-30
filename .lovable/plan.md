# Modernizar o visual do Início

Só aparência: números, regras e links continuam os mesmos.

## Problemas atuais
- Muitos blocos parecidos empilhados (4 indicadores, 4 atalhos, 3 linhas de gráficos/painéis), sem uma hierarquia clara.
- Dois gráficos quase repetidos ("Entradas e saídas por dia" e "Movimentações de pessoas").
- Cartões todos do mesmo peso; títulos pequenos; pouco respiro.
- A tela é muito larga (2654 px) e os blocos se esticam demais.

## Mudanças propostas
1. **Faixa de destaque no topo**: saudação + data, linha discreta do Hermes, e o seletor 7/30/90 dias à direita (vale para a página toda).
2. **Indicadores maiores**: número grande, ícone em círculo colorido suave, seta de variação (verde/vermelha) e mini-gráfico na base do cartão.
3. **Atalhos de pendências como "chips"**: os 4 cartões pequenos viram uma faixa única de etiquetas com contagem; ficam em cinza quando zerados e em âmbar quando têm itens.
4. **Um único gráfico principal**: "Entradas e saídas" com barras arredondadas, legenda em cima e total do período; o gráfico "Movimentações" vira uma aba dentro dele (Entradas/saídas | Mudanças).
5. **Coluna lateral**: "Categoria de Usuários" como anel (donut) com legenda clicável, e "Licenças em uso" com barras de progresso coloridas pela ocupação.
6. **Pendências de governança e Atividade recente lado a lado**, com linhas mais limpas, ícones já existentes e contagem em selo.
7. **Largura máxima** de conteúdo (~1600 px) centralizada, grid de 12 colunas, espaçamento maior entre blocos.
8. **Acabamento**: cantos mais arredondados, bordas suaves, carregamento com "esqueletos" no lugar de telas vazias, entrada escalonada já existente, tudo com as cores do tema (teal) e funcionando no modo escuro.

```text
[ Bom dia, Mathews · Hermes online ............ 7 | 30 | 90 ]
[ KPI ][ KPI ][ KPI ][ KPI ]
[ chips de pendências ...................................... ]
[ Gráfico principal (2/3)            ][ Categorias (donut)  ]
[                                    ][ Licenças em uso     ]
[ Pendências de governança ][ Atividade recente ............ ]
```

## Detalhes técnicos
- Arquivos: `src/pages/Dashboard.tsx`, `src/components/StatCard.tsx`/`KpiCard`, `PeopleLifecycleChart`, tokens em `src/index.css` (raio, sombras suaves, cores de gráfico).
- Sem mudar consultas, RPCs ou filtros (`dashboardFilters.ts`); testes atuais do dashboard devem continuar passando.
- Verificação com captura de tela em 1280 px e na largura atual.
