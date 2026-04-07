

## Plano: Corrigir fluxo de troca de perfil (delta) e desabilitação completa

### Problema 1 — Troca de cargo/perfil não faz delta

Hoje `provisionCargoAcessos` faz `remove ALL old` + `assign ALL new`. Isso gera ações desnecessárias (remove e re-adiciona recursos que existem nos dois perfis) e pode causar interrupções temporárias para o usuário.

**Correção:** Calcular o delta real entre os recursos do perfil antigo e do novo, e só gerar ações para o que realmente mudou.

**Arquivo:** `src/lib/provisionCargoAcessos.ts`

- Buscar os perfis do cargo antigo e do cargo novo
- Usar `getMergedResourcesForPerfis` para obter os recursos de cada lado
- Calcular: `addedGrupos = novos - antigos`, `removedGrupos = antigos - novos` (idem para licenças e apps)
- Chamar `generateEntraQueueForDiff` com o delta real em vez de `queueFullProfileActions` duas vezes
- Resultado: recursos comuns aos dois perfis permanecem intactos no Entra ID

### Problema 2 — Desabilitação não remove grupos/licenças/apps do Entra ID

Quando o status muda para `inativo`/`desligado`, o sistema:
- ✅ Envia `disable` para o AD local (via iam-agent-api)
- ❌ NÃO remove grupos, licenças e apps do Entra ID
- ❌ NÃO desabilita a conta no Entra ID (accountEnabled=false via Graph API)

**Correções:**

1. **`src/pages/colaboradores/ColaboradorDetalhePage.tsx`** — no bloco de desabilitação (linhas 158-186):
   - Após inserir a ação `disable` para o AD, buscar todos os perfis ativos do colaborador
   - Chamar `queueFullProfileActions` com mode `"remove"` para gerar remoções de grupos/licenças/apps
   - Adicionar uma ação `disable_entra` na fila para desabilitar a conta no Entra ID

2. **`supabase/functions/process-iam-queue/index.ts`** — adicionar suporte ao action_type `disable_entra`:
   - Resolver o userId no Entra ID
   - Fazer `PATCH /users/{userId}` com `{ "accountEnabled": false }`
   - Adicionar `"disable_entra"` e `"enable_entra"` ao array `ENTRA_ACTION_TYPES`

3. **Reativação** — no bloco de reativação (linhas 189-219):
   - Adicionar ação `enable_entra` para reabilitar a conta no Entra ID (`accountEnabled: true`)
   - O `provisionCargoAcessos` já é chamado para re-atribuir os recursos

### Problema 2b — Mesma lógica nos fluxos de importação

Os mesmos ajustes devem ser aplicados em:
- `supabase/functions/sync-csv-colab/index.ts` 
- `supabase/functions/sync-sharepoint-csv/index.ts`

Esses arquivos já detectam desabilitação mas só enviam `disable` para AD — precisam também gerar remoções de recursos e `disable_entra`.

### Arquivos a alterar

| Ação | Arquivo |
|---|---|
| Reescrever delta | `src/lib/provisionCargoAcessos.ts` |
| Adicionar remoção de recursos + disable_entra | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |
| Adicionar enable_entra na reativação | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |
| Novo action_type disable_entra/enable_entra | `supabase/functions/process-iam-queue/index.ts` |
| Atualizar desabilitação na importação CSV | `supabase/functions/sync-csv-colab/index.ts` |
| Atualizar desabilitação na importação SharePoint | `supabase/functions/sync-sharepoint-csv/index.ts` |

### Ordem de implementação

1. Adicionar `disable_entra` e `enable_entra` na Edge Function
2. Reescrever `provisionCargoAcessos` com cálculo de delta real
3. Corrigir fluxo de desabilitação no `ColaboradorDetalhePage`
4. Corrigir fluxo de desabilitação nas Edge Functions de importação

