

## Plano: Importar todos os registros do CSV, mesmo sem matricula

### Problema

A funcao `sync-csv-colab` descarta linhas em duas situacoes (linha 110 e 116 de `index.ts`):

1. **Linha 110:** `if (values.length < rawHeaders.length * 0.5) continue;` — linhas malformadas
2. **Linha 116:** `if (!(row["employID"] || "").trim()) continue;` — linhas sem matricula

Isso exclui 41 registros do CSV da 2Easy que nao possuem `employID`.

### Solucao

Modificar a edge function `sync-csv-colab` para:

1. **Remover o skip de `employID` vazio** — em vez de descartar, gerar uma matricula sintetica no formato `SEM_MAT_<indice>` para linhas sem matricula, garantindo unicidade
2. **Usar `displayName + mail + Cadastro_Pessoa_Fisica` como chave alternativa** — para linhas sem employID, usar uma combinacao de campos para gerar o hash de identificacao e evitar duplicatas em re-imports
3. **Manter contadores de linhas sem matricula** para visibilidade no painel de integracao

### Detalhes tecnicos

**Arquivo:** `supabase/functions/sync-csv-colab/index.ts`

Alterar `parseCsv()` (linhas 108-121):
- Remover a linha `if (!(row["employID"] || "").trim()) continue;`
- Apos o loop, para linhas sem `employID`, gerar matricula sintetica: `SEM_MAT_<hash_curto_do_nome+cpf>`
- Isso garante que re-imports nao dupliquem esses registros

Alterar `processCsvData()`:
- Na classificacao (linhas 200-215), tratar linhas com matricula sintetica da mesma forma que as demais
- Adicionar log de quantas linhas vieram sem matricula original

**Arquivo:** `src/pages/configuracoes/IntegracoesPage.tsx`
- Exibir no painel de progresso quantas linhas foram importadas sem matricula (informativo)

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-csv-colab/index.ts` — remover skip, gerar matricula sintetica |
| Editar | `supabase/functions/sync-sharepoint-csv/index.ts` — mesma logica (chama a mesma function, verificar) |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` — exibir contagem informativa |

