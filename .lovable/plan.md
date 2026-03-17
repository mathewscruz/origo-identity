

## Diagnostico

Analisei o CSV e o codigo das duas edge functions. Existem 3 problemas causando as divergencias:

### 1. Cargo: prioridade invertida
O codigo usa `row.title || row.description` para cargo (linhas 174/212 do sharepoint e 245/306 do csv-colab). O usuario quer que `description` seja a fonte primaria de cargos. No CSV, ambas as colunas existem e geralmente tem o mesmo valor, mas quando divergem, `title` esta sendo priorizado incorretamente.

**Correcao**: Inverter para `row.description || row.title` em ambas as funcoes (buildColabData e coleta de missingCargos).

### 2. Status: mapeamento incompleto
O STATUS_MAP tem `demitido: "desligado"`, mas o CSV usa "Demitido" (maiusculo). O `.toLowerCase()` resolve isso, porem faltam mapeamentos para variantes comuns. Alem disso, o campo `description` nao esta incluido no `hashFields`, entao mudancas no cargo nao sao detectadas como alteracoes.

**Correcao**: Adicionar `description` ao `hashFields` e garantir que todos os status do CSV estejam mapeados.

### 3. Timeout: funcao ainda estoura 150s
Os logs mostram `shutdown` ~197s apos o boot, com 3574 novos registros para inserir. Mesmo com batches de 200, sao ~18 inserts + lookups + gestores + snapshots = muitas queries. Os snapshots sozinhos sao 3874 linhas / 200 = ~20 inserts extras.

**Correcao**: Aumentar batch size para 500, pular snapshots na primeira importacao (ou tornar opcional), e remover a resolucao de gestores da funcao principal (fazer como job separado).

## Plano de implementacao

### Arquivo 1: `supabase/functions/sync-csv-colab/index.ts`
- Linha 119/hashFields: adicionar `row.description`
- Linha 245 (missingCargos): trocar `row.title || row.description` por `row.description || row.title`
- Linha 306 (buildColabData cargo_id): trocar `row.title || row.description` por `row.description || row.title`
- Aumentar chunk size de 200 para 500 nos inserts de colaboradores e snapshots
- Pular insercao de snapshots para reduzir queries (sao ~20 inserts a menos)

### Arquivo 2: `supabase/functions/sync-sharepoint-csv/index.ts`
- Mesmas correcoes: `description` como fonte primaria de cargo
- hashFields: adicionar `row.description`
- Chunk size 500
- Pular snapshots
- Pular resolucao de gestores (fazer em job separado se necessario) para economizar ~50s

### Resumo de mudancas

| Arquivo | Mudanca |
|---|---|
| `sync-csv-colab/index.ts` | Priorizar `description` para cargo, adicionar ao hash, batch 500, otimizar snapshots |
| `sync-sharepoint-csv/index.ts` | Mesmas correcoes + pular gestores para evitar timeout |

