

## Plano: Corrigir nomes na atividade recente + otimizacoes gerais

### 1. Corrigir labels da Atividade Recente no Dashboard

**Problema:** A query `useRecentActivity` busca apenas `target_identity` da `iam_queue`, que frequentemente e um UUID ou ID interno (como `2eefb39b-a992-42dd-803d-9ecd4d367569`). O label deveria mostrar o nome legivel do colaborador e a acao realizada.

**Correcao:** Incluir `payload_json` na query e construir o label a partir dos campos do payload:
- Para `assign_group`/`remove_group`: `"{displayName} → {groupName}"`
- Para `assign_app`/`remove_app`: `"{displayName} → {appName}"`
- Para `assign_license`/`remove_license`: `"{displayName} → {licenseName}"`
- Para `create`/`disable`/`update`: `"{displayName || target_identity}"`
- Fallback: `target_identity` ou `action_type`

Tambem adicionar o mapeamento de `action_type` para texto legivel (ex: `assign_group` → "Atribuicao de Grupo") como subtipo na linha de descricao.

**Arquivo:** `src/pages/Dashboard.tsx` — funcao `useRecentActivity` (linhas 210-246) e renderizacao (linhas 470-491)

### 2. Otimizacoes identificadas (seguras, sem risco de quebra)

**A. Remover arquivo legado nao utilizado**
- `src/pages/PlaceholderPage.tsx` — nao e importado em nenhum lugar do projeto. Pode ser removido com seguranca.

**B. Reduzir polling excessivo no Dashboard**
- O Dashboard tem 6 queries com `refetchInterval: 30000` (30s) que disparam simultaneamente. Para dados que mudam pouco (KPIs, acessos por app), aumentar para 60s. Manter 30s apenas para atividade recente e fila.
- `useKpiCounts`: 30s → 60s
- `useAccessByApp`: 60s (ja esta ok)
- `useSolicitacoesByStatus`: 30s → 60s
- `useRevisoesAtivas`: 30s → 60s

**C. Adicionar `staleTime` nas queries do Dashboard**
- Nenhuma query do Dashboard define `staleTime`, o que causa refetches desnecessarios ao navegar entre paginas. Adicionar `staleTime: 15000` (15s) nas 6 queries para evitar requisicoes duplicadas.

**D. Otimizar query `useAccessByApp`**
- Atualmente faz 3 queries encadeadas (atribuicoes → perfil_aplicacoes → aplicacoes). As duas ultimas usam `.slice(0, 200)` e `.slice(0, 50)` como limites arbitrarios. Manter os limites mas adicionar tratamento para quando o `.in()` recebe array vazio (evitar query desnecessaria).

**E. Status label "success" na atividade recente**
- O `STATUS_MAP` nao tem entrada para `"success"`, entao itens concluidos da fila aparecem como texto cru "success". Adicionar: `success: { label: "Concluido", color: "..." }` e tambem `pending` e `failed` ao mapa.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/Dashboard.tsx` — corrigir labels + adicionar staleTime + ajustar refetchInterval + mapear status |
| Remover | `src/pages/PlaceholderPage.tsx` — arquivo legado nao utilizado |

