

## Problema Raiz

Os logs confirmam: `sync-csv-colab responded: 504` — a funcao atinge o timeout de 150s do Edge Function porque processa 3874 linhas **uma a uma**, fazendo ~6 chamadas ao banco por linha (total ~23.000 chamadas).

A arquitetura atual tambem tem o problema de **funcao chamando funcao** (sync-sharepoint-csv → sync-csv-colab), onde ambas compartilham o mesmo limite de timeout.

## Solucao

Reescrever `sync-csv-colab` com **processamento em lote** e otimizar `sync-sharepoint-csv` para processar diretamente (sem chamar a segunda funcao).

### 1. Reescrever `supabase/functions/sync-csv-colab/index.ts`

Manter para uploads manuais, mas otimizar com batches:

- **Fase 1** (in-memory): Parsear CSV, computar hashes, identificar quais matriculas sao novas vs existentes vs sem mudanca
- **Fase 2**: Coletar todos os valores unicos de empresa/cargo/area/localidade. Fazer batch create de uma vez (1 query por tipo em vez de 1 por linha)
- **Fase 3**: Batch insert dos novos colaboradores (chunks de 200). Batch update dos alterados (chunks de 200)
- **Fase 4**: Batch insert dos eventos JML
- **Fase 5**: Leavers + gestores em batch

Isso reduz de ~23.000 chamadas ao banco para ~30-50 chamadas totais.

### 2. Reescrever `supabase/functions/sync-sharepoint-csv/index.ts`

Em vez de chamar sync-csv-colab via HTTP (que causa timeout duplo):
- Baixar CSV do SharePoint (ja funciona)
- Processar o CSV **diretamente** na mesma funcao usando a mesma logica otimizada
- Elimina o problema de funcao chamando funcao

Alternativa mais limpa: extrair a logica de processamento para funcoes compartilhadas inline em cada funcao (Edge Functions nao suportam imports entre funcoes).

### 3. Diff incremental nas sincronizacoes automaticas

A logica de hash ja existe (`import_hash`). Com a otimizacao em batch:
- Carregar todos os hashes existentes em memoria
- Comparar com hashes do CSV novo
- Somente processar linhas com hash diferente ou matriculas novas
- Linhas sem mudanca: zero operacoes de banco

### 4. Independencia da sessao do usuario

O processamento ja ocorre server-side na Edge Function. O `sync_jobs` persiste o progresso no banco. O frontend ja usa polling (`useSyncJobsCsv`). O usuario pode sair e o progresso continua. A unica mudanca e garantir que o frontend mostre o status corretamente ao retornar.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Reescrever | `supabase/functions/sync-csv-colab/index.ts` — batch processing |
| Reescrever | `supabase/functions/sync-sharepoint-csv/index.ts` — processar CSV inline |

### Detalhe tecnico das otimizacoes

```text
ANTES (por linha):
  getOrCreateEmpresa()   → 1-2 queries
  getOrCreateCargo()     → 1-2 queries
  getOrCreateArea()      → 1-2 queries
  getOrCreateLocal()     → 1-2 queries
  insert/update colab    → 1 query
  insert evento_jml      → 1 query
  insert snapshot        → 1 query (batched/50)
  update progress        → 1 query (cada 50)
  ─────────────────────────────────
  Total: ~23.000 queries para 3874 linhas

DEPOIS (em lote):
  Parse + hash           → 0 queries (in-memory)
  Load existentes        → 1 query
  Batch create empresas  → ~5 queries
  Batch create cargos    → ~5 queries
  Batch create areas     → ~5 queries
  Batch create locais    → ~5 queries
  Batch insert novos     → ~20 queries (200/chunk)
  Batch update alterados → ~20 queries (200/chunk)
  Batch insert eventos   → ~10 queries
  Batch insert snapshots → ~20 queries
  Leavers + gestores     → ~10 queries
  ─────────────────────────────────
  Total: ~100 queries para 3874 linhas
```

