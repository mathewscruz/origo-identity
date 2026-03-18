

## Plano: Importar todas as linhas do CSV, incluindo duplicatas de employID

### Problema

O sistema usa `matricula` (employID) como chave unica em um `Map` para classificar registros como novos/alterados/inalterados. Quando o CSV tem 41 linhas com o mesmo `employID` que outra linha, o Map sobrescreve a anterior e apenas uma e inserida no banco.

### Solucao

Tornar cada linha do CSV unica adicionando um sufixo sequencial a matriculas duplicadas. Se o CSV tem 3 linhas com `employID = "123"`, elas se tornam `"123"`, `"123_DUP_2"`, `"123_DUP_3"`.

### Alteracoes

**1. `supabase/functions/sync-csv-colab/index.ts`** — Apos o loop de hashing (seção 3, ~linha 185-193):

- Detectar matriculas duplicadas usando um contador por matricula
- Para a segunda ocorrencia em diante, adicionar sufixo `_DUP_N` a matricula
- Logar quantas duplicatas foram encontradas
- Usar a matricula modificada em `buildColabData()` para que cada registro tenha matricula unica no banco

**2. `supabase/functions/sync-sharepoint-csv/index.ts`** — Mesma logica de deduplicacao (seção equivalente, ~linha 134-141).

### Logica de deduplicacao (pseudo-codigo)

```text
const matCount = new Map<string, number>();
for (const item of rowsWithHash) {
  const count = (matCount.get(item.matricula) || 0) + 1;
  matCount.set(item.matricula, count);
  if (count > 1) {
    item.matricula = `${item.matricula}_DUP_${count}`;
    item.row.employID = item.matricula;
    // recalculate hash since matricula changed
  }
}
```

### Resultado esperado

Todas as 3874 linhas do CSV serao importadas como registros individuais no banco. Em re-imports, as duplicatas serao reconhecidas pelo sufixo `_DUP_N` e atualizadas normalmente.

