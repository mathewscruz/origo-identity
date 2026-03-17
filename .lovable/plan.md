

## Problema

O CSV do SharePoint usa **vírgula** (`,`) como delimitador, mas o parser na edge function `sync-csv-colab` está hardcoded para usar **ponto e vírgula** (`;`) nas linhas 90 e 115. Por isso, toda a linha é tratada como uma única coluna, os headers não são encontrados corretamente, e 0 registros são processados.

Exemplo do CSV real:
```
cn,company,description,displayName,employID,...
Maria Mercedes...,Ebes Sistemas De Energia S.A.,...
```

## Correção

### Editar `supabase/functions/sync-csv-colab/index.ts`

1. **Auto-detectar delimitador**: Analisar a primeira linha do CSV e contar ocorrências de `,` vs `;` para escolher automaticamente o delimitador correto.

2. **Usar o delimitador detectado** nas duas linhas de split (headers na linha 90 e valores na linha 115).

3. **Tratar campos com aspas**: CSVs com vírgula podem ter valores entre aspas contendo vírgulas internas (ex: `"Empresa, Ltda"`). Implementar parsing CSV robusto que respeite aspas.

4. **Verificar mapeamento de colunas adicionais**: O CSV real tem colunas extras como `cn`, `description`, `givenName`, `L`, `sn`, `sAMAccountName`, `Data_Nascimento`, `Bairro`, `CEP`, `Cidade`, `Estado`, etc. O `description` pode servir como fallback para cargo quando `title` estiver vazio (já existe essa lógica na linha 396). O campo `departmentNumber` no CSV real contém apenas números (ex: `60506`), não nomes de área — precisamos decidir se criamos áreas com esses códigos ou ignoramos.

5. **Deploy** da função atualizada.

### Resumo de mudanças

| Arquivo | Mudança |
|---|---|
| `supabase/functions/sync-csv-colab/index.ts` | Auto-detectar delimitador (`,` vs `;`), parsing robusto com suporte a aspas |

Nenhuma mudança de schema é necessária — a estrutura do banco já comporta todos os campos do CSV.

