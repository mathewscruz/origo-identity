

## Plano: Ordenar itens selecionados no topo + Corrigir sync de Privilegiados

### 1. Itens selecionados no topo em listas de multi-seleção

Em todas as listas com Checkbox de multi-seleção, ordenar para que os itens marcados apareçam primeiro. Aplicar `.sort()` antes do `.map()`, comparando se o item está na lista de selecionados.

**Arquivos afetados:**

| Arquivo | Listas |
|---|---|
| `PerfisAcessoPage.tsx` | aplicacoes, licenças, grupos (3 listas com `form.*_ids`) |
| `PerfilAcessoDetalhePage.tsx` | aplicacoes, licenças, grupos (3 listas com `editForm.*_ids`) |
| `CargosPage.tsx` | perfis de acesso (1 lista com `selectedPerfis`) |

**Padrão de ordenação:**
```text
// Antes do .map(), adicionar .sort():
.filter(...)
.sort((a, b) => {
  const aSelected = ids.includes(a.id) ? 0 : 1;
  const bSelected = ids.includes(b.id) ? 0 : 1;
  return aSelected - bSelected;
})
.map(...)
```

### 2. Corrigir erro na sincronização de Privilegiados

A Edge Function `sync-entra-roles` está dando timeout. O problema é que ela faz muitas chamadas sequenciais ao banco (upsert role, select id, delete members, insert members) para cada role, sem batch.

**Correção em `supabase/functions/sync-entra-roles/index.ts`:**
- Reduzir chamadas usando batch inserts para members (insert array em vez de loop)
- Usar `returning: "minimal"` nas operações de insert para reduzir payload
- Adicionar timeout handling e logging para identificar gargalos

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` — sort selecionados no topo (3 listas) |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — sort selecionados no topo (3 listas) |
| Editar | `src/pages/configuracoes/CargosPage.tsx` — sort perfis selecionados no topo |
| Editar | `supabase/functions/sync-entra-roles/index.ts` — batch inserts + otimizar performance |

