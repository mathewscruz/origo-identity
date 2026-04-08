

## Plano: Adicionar seletor de periodo nos graficos de Provisionamento e Solicitacoes

### Alteracoes em `src/pages/Dashboard.tsx`

**1. Refatorar hook `useWeeklyProvisioningData` para aceitar periodo dinamico:**
- Renomear para `useProvisioningData(period)` onde period = `"dia" | "semana" | "mes" | "ano"`
- Dia: ultimos 14 dias, agrupado por dia (D1..D14)
- Semana: ultimas 8 semanas (comportamento atual)
- Mes: ultimos 12 meses, agrupado por mes (Jan, Fev...)
- Ano: ultimos 4 anos, agrupado por ano

**2. Refatorar hook `useSolicitacoesByStatus` para aceitar periodo dinamico:**
- Aceitar mesmo tipo de periodo
- Dia: ultimos 14 dias
- Semana: ultimas 8 semanas
- Mes: ultimos 12 meses
- Ano: ultimos 4 anos
- Query key inclui o periodo para refetch automatico

**3. Adicionar estados `provPeriod` e `solicitPeriod` no componente Dashboard:**
- `useState<"dia"|"semana"|"mes"|"ano">("semana")` para cada grafico

**4. Adicionar toggle de periodo no CardHeader de cada grafico:**
- Grupo de botoes pequenos (estilo segmented control) usando `Button` variant `ghost`/`outline` com tamanho `sm`
- Opcoes: Dia | Semana | Mes | Ano
- Botao ativo com estilo `default` (preenchido)
- Posicionado ao lado direito do titulo no CardHeader

**5. Simplificar titulos:**
- "Provisionamento — 8 Semanas" → "Provisionamento"
- "Solicitacoes — Ultimos 90 dias" → "Solicitacoes"

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/Dashboard.tsx` — hooks parametrizados, estados de periodo, toggles no header, titulos simplificados |

