

## Plano: CSV como fonte unica da verdade

### Diagnostico

O banco tem **3924** colaboradores (origem=csv), mas o XLSX de hoje tem **3874** linhas. A diferenca vem de **91 registros com sufixo `_DUP_`** criados pela logica anterior de deduplicacao, que criava registros fantasma para linhas com mesmo `employID`. Essas linhas duplicadas no CSV representam a **mesma pessoa** (dados repetidos ou versoes diferentes), nao pessoas distintas.

### Mudancas

**1. `supabase/functions/sync-csv-colab/index.ts`**

- **Remover logica `_DUP_`**: Para employIDs duplicados, manter apenas a **ultima ocorrencia** no CSV (dados mais recentes). Nao criar registros separados.
- **Substituir quarentena por DELETE**: No passo 10, em vez de inserir em `colab_quarentena`, **deletar** os colaboradores com `origem='csv'` cuja matricula nao esta no CSV atual. Registrar o evento como `leaver` no `eventos_jml` antes de deletar.
- **Manter contagem informativa**: Logar quantas duplicatas foram consolidadas e quantos registros foram removidos.

**2. `supabase/functions/sync-sharepoint-csv/index.ts`**

- Aplicar as mesmas mudancas (remove _DUP_, delete em vez de quarentena).

### Logica resumida

```text
// Deduplicacao: manter ultima ocorrencia
const deduped = new Map<string, {row, hash}>();
for (const item of rowsWithHash) {
  deduped.set(item.matricula, item); // sobrescreve
}
rowsWithHash = Array.from(deduped.values());

// Passo 10: DELETE em vez de quarentena
for (const [matricula, existing] of existingMap) {
  if (!csvMatriculas.has(matricula)) {
    // Registrar evento leaver
    // DELETE do colaboradores
    await sb.from("colaboradores").delete().eq("id", existing.id);
  }
}
```

### Resultado esperado

Apos a importacao, o numero de colaboradores no sistema sera **exatamente igual** ao numero de matriculas unicas no CSV (3874 linhas, menos duplicatas de employID = ~3833 registros unicos). Colaboradores que nao estao mais no CSV serao removidos automaticamente.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-csv-colab/index.ts` |
| Editar | `supabase/functions/sync-sharepoint-csv/index.ts` |

