## Auditoria dos KPIs do Dashboard vs banco

Comparei cada consulta do `Dashboard.tsx` contra o banco real:

| Card | Valor exibido (lógica) | Realidade no banco | Status |
|---|---|---|---|
| Pessoas Ativas | colabs ativos + terceiros ativos = **604** | 604 + 0 = 604 | ✅ |
| Aplicações Conectadas | `connector_type != 'manual'` = **0** | 535 aplicações, todas `manual` | ❌ **Bug: sempre 0** |
| Perfis Ativos | 4 | 4 | ✅ |
| Solicitações Pendentes | 0 | 0 | ✅ |
| **Fila de Provisionamento** | apenas `status='pending'` = **8** | 8 pending + **3360 waiting_approval** | ❌ **Não reflete a fila real** |
| Alertas Não Lidos | 56 | 56 | ✅ |

Outras verificações:
- Gráfico "Provisionamento" (área): filtra `!= cancelled` e classifica por prefixo `assign`/`remove`/`disable` — correto.
- Gráfico "Acessos por Aplicação" (donut): usa `perfilIds.slice(0, 200)` e `appIds.slice(0, 50)` — cap silencioso; pode subestimar em ambientes maiores. Hoje temos só 4 perfis, então não impacta.
- Solicitações por Status: OK, agrupa `created_at >= período`.
- Atividade Recente: OK, mistura queue + solicitações.

## Correções propostas

### 1. Fila de Provisionamento (crítico)

Incluir `waiting_approval` no card (é o estado onde os itens ficam quando o gate de aprovação está ligado — hoje 3360 itens).

**Mudança em `useKpiCounts`:**
```ts
supabase.from("iam_queue").select("id", { count: "exact", head: true })
  .in("status", ["pending", "waiting_approval"])
```
Sub-label passa de "itens pendentes" para "aguardando execução/aprovação".

### 2. Aplicações Conectadas (crítico)

Como todas as aplicações hoje são `manual`, o filtro atual sempre dá 0. Duas opções — vou aplicar a **A** (mostra realidade sem esconder nada):

**A. Mostrar todas as aplicações cadastradas** (mais fiel — o usuário quer saber quantas apps existem):
```ts
supabase.from("aplicacoes").select("id", { count: "exact", head: true })
```
Sub-label: "aplicações cadastradas".

**B.** Manter só apps com conector automático, mas dropar `null`:
```ts
.not("connector_type", "is", null).neq("connector_type", "manual")
```

### 3. Access-by-App: remover caps silenciosos

Trocar `.slice(0, 200)` e `.slice(0, 50)` por paginação simples em lotes de 1000 até esgotar. Baixo impacto agora (4 perfis), mas evita bug futuro.

### 4. Extras (opcional)

- Adicionar tooltip explicativo nos KPIs alterados (o que "aguardando execução/aprovação" significa).
- No card "Fila de Provisionamento" mostrar breakdown "X aguardando aprovação · Y prontos p/ execução" no sub-label.

## Fora de escopo

- Redesign de gráficos.
- Novos cards (órfãos, criações pendentes etc.) — pode virar próximo pedido.
