

## Plano: Corrigir sincronizacao de grupos no sync-user-access

### Diagnostico

A funcao `sync-user-access` importa corretamente apps (57 registros) e licencas (49 registros) do Entra ID, mas **zero grupos** foram registrados na `iam_queue`.

A funcao busca os grupos do usuario via `memberOf`, que retorna apenas membros **diretos**. Muitos usuarios recebem grupos por heranca (grupos aninhados), que so aparecem via `transitiveMemberOf`.

Alem disso, a funcao nao tem logging detalhado para diagnosticar quantos grupos foram encontrados no Entra vs quantos casaram com a tabela local `entra_grupos`.

### Alteracoes

**Editar `supabase/functions/sync-user-access/index.ts`:**

1. Trocar `memberOf` por `transitiveMemberOf` no `fetchUserGroups` para capturar grupos diretos e herdados
2. Adicionar log detalhado mostrando quantos grupos vieram do Entra, quantos casaram com a tabela local, e quais nao casaram
3. Fazer o match de grupos em batches caso o array de entra_ids seja muito grande (>50 items) para evitar URLs longas no Supabase query

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-user-access/index.ts` — trocar memberOf por transitiveMemberOf + logging |

