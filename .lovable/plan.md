

## Plano: Reformular Dashboard com metricas reais e graficos interativos

### Situacao atual

O dashboard tem 4 KPIs basicos, 1 grafico de barras (provisionamento semanal), 1 pie chart (acessos ativos/revogados) e 1 tabela de fila recente. Faltam metricas de modulos importantes: Solicitacoes, Revisoes, Aplicacoes, Terceiros, Conectores, SoD.

### Novo Layout

```text
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Pessoas  │Aplicacoes│ Perfis   │Solicit.  │ Fila     │ Alertas  │
│ Ativas   │Conectadas│ Ativos   │Pendentes │Pendente  │ NaoLidos │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
┌─────────────────────────────┬────────────────────────────────────┐
│ Provisionamento 8 Semanas   │ Distribuicao de Acessos (Donut)   │
│ (AreaChart com gradiente)   │ (por app, top 5 + outros)         │
└─────────────────────────────┴────────────────────────────────────┘
┌─────────────────────────────┬────────────────────────────────────┐
│ Solicitacoes por Status     │ Revisoes de Acesso                │
│ (Donut: pendente/aprovada/  │ (Progresso das revisoes ativas)   │
│  rejeitada)                 │                                   │
└─────────────────────────────┴────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Atividade Recente (timeline unificada: fila + solicitacoes)     │
└──────────────────────────────────────────────────────────────────┘
```

### Alteracoes

**1. KPIs expandidos (6 cards em grid responsivo):**
- Pessoas Ativas (colaboradores + terceiros)
- Aplicacoes Conectadas (count de aplicacoes com `connector_type != 'manual'`)
- Perfis de Acesso Ativos (count)
- Solicitacoes Pendentes (count de `solicitacoes_acesso` com status pendente/em_aprovacao)
- Fila Pendente (count de iam_queue pending)
- Alertas Nao Lidos

Cada KPI clicavel, levando ao modulo correspondente.

**2. Grafico de Provisionamento — AreaChart com gradiente:**
- Trocar BarChart por AreaChart com preenchimento gradiente
- Manter dados semanais, visual mais moderno
- Tooltip customizado usando ChartTooltipContent

**3. Distribuicao de Acessos por Aplicacao (novo):**
- Donut chart mostrando top 5 aplicacoes com mais atribuicoes + "Outros"
- Consulta: join `perfil_atribuicoes` → `perfil_aplicacoes` → `aplicacoes`
- Cores do tema

**4. Solicitacoes por Status (novo):**
- Donut chart: pendente, em_aprovacao, aprovada, rejeitada
- Dados de `solicitacoes_acesso` dos ultimos 90 dias

**5. Revisoes de Acesso (novo):**
- Cards com progresso de revisoes em andamento
- Barra de progresso mostrando % de itens decididos

**6. Atividade Recente (reformulado):**
- Timeline unificada com as ultimas 8 acoes (iam_queue + solicitacoes)
- Icones por tipo de acao, cores por status
- Links para detalhes

**7. Visual:**
- Usar `ChartContainer` + `ChartTooltipContent` do shadcn/ui para tooltips bonitos
- Animacoes de entrada com CSS (fade-in nos cards)
- Cores consistentes com o tema (primary teal, success, warning, destructive)
- Refresh em tempo real a cada 30s

### Arquivos

| Acao | Arquivo |
|---|---|
| Reescrever | `src/pages/Dashboard.tsx` — novo layout completo com todos os graficos e KPIs |

