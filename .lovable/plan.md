## Diagnóstico

Verifiquei o backend:

| Widget atual | Dados hoje | Problema |
|---|---|---|
| Provisionamento (área) | 2.878 eventos em 90d | Gráfico conta eventos **por bucket** (dia/semana). Dias sem provisionamento aparecem como 0 → parece "resetar". Não é uma linha do tempo, é um histograma. |
| Acessos por Aplicação (donut) | apenas **3** `perfil_atribuicoes` ativas | Sempre vazio/inútil. |
| Solicitações (donut) | **0** `solicitacoes_acesso` | Sempre vazio. |
| Revisões em Andamento | **0** revisões ativas | Sempre vazio. |

Dados ricos disponíveis que não estão sendo mostrados: 3.408 eventos JML em 90d, 3.791 colaboradores com distribuição clara de status, 16 alertas não lidos, fila com estados variados.

## Mudanças propostas

### 1. Provisionamento vira linha do tempo cumulativa
- Mesmo eixo/períodos (Dia/Semana/Mês/Ano), mas soma acumulada de Concessões e Revogações ao longo do tempo — a linha **só cresce**, dando a sensação real de timeline.
- Mantém as 3 séries (Concessão / Revogação / Outros) empilhadas.
- Aumenta janela default de "semana" e recalcula os buckets em ordem cronológica correta (hoje sempre à direita).

### 2. "Acessos por Aplicação" → **Colaboradores por Status** (donut)
Usa dados reais de `colaboradores.status`: Ativo (591), Desligado (3.164), Férias (23), Afastado (12), Inativo (1). Cores semânticas Órigo. Clique leva para `/colaboradores` já filtrado.

### 3. "Solicitações" → **Eventos JML por Tipo** (donut, com seletor de período)
Usa `eventos_jml` agrupado por `tipo` (Joiner / Mover / Leaver) no período selecionado. Já temos 3.408 eventos em 90d. Clique leva para `/eventos-jml`.

### 4. "Revisões de Acesso em Andamento" → **Fila de Provisionamento por Status** (barras)
Barras horizontais com contagem por status da `iam_queue` (Aguardando aprovação, Pendente, Processando, Falhou, Concluído nos últimos 7d). Cada barra é um link para `/fila-provisionamento?status=…`. Dá visão operacional imediata do que precisa de ação.

## Arquivos afetados

- `src/pages/Dashboard.tsx` — único arquivo. Reescrevo os hooks `useProvisioningData`, substituo `useAccessByApp` / `useSolicitacoesByStatus` / `useRevisoesAtivas` pelos três novos hooks, e ajusto o JSX das linhas 2 e 3 do grid.

Sem migrações, sem edge functions, sem mudanças de schema.
