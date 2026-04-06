

## Plano: Corrigir o fluxo de diff do perfil de acesso que não gera entradas na fila

### Causa raiz identificada

A tabela `perfil_atribuicoes` **não tem foreign key** para `colaboradores`. Por isso, a query na linha 121:

```typescript
.select("colaborador_id, colaboradores(nome, email, sam_account_name)")
```

Retorna `colaboradores: null` para cada registro. Na linha 130, o código faz `if (!colab) continue;` — e pula todos os colaboradores. **Zero entradas são geradas na fila.**

Além disso, mesmo que gerasse, a chamada `triggerEntraProcessing()` na linha 194 já está fora do bloco `if (hasChanges)`, o que está correto (force=true por padrão). Mas o problema principal é que nunca chega a inserir nada.

### Correção

**Arquivo:** `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`

Substituir a query com join (que falha sem FK) por duas queries separadas:

1. Buscar `perfil_atribuicoes` filtrando por `perfil_id` e `ativo = true` para obter os `colaborador_id`s
2. Buscar os dados dos colaboradores (`nome`, `email`, `sam_account_name`) separadamente pela lista de IDs

Isso elimina a dependência de foreign key e garante que os dados do colaborador são obtidos corretamente.

### Detalhes técnicos

```text
Hoje:
perfil_atribuicoes.select("colaborador_id, colaboradores(...)")
→ colaboradores = null (sem FK)
→ skip all
→ 0 queue entries

Depois:
1. perfil_atribuicoes.select("colaborador_id").eq("perfil_id", id).eq("ativo", true)
2. colaboradores.select("id, nome, email, sam_account_name").in("id", colabIds)
3. match por id → gera entries corretamente
```

### Resumo de arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — substituir join por queries separadas |

