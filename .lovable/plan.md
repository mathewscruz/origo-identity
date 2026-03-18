

## Plano: Sync progressivo com % e sem limite de tempo

### Problema identificado

A funcao `fetchAllPages` busca **todos** os grupos em memoria antes de gravar no banco. Para tenants grandes, isso causa timeout da Edge Function (~60s) antes de processar tudo. Grupos parcialmente buscados sao perdidos.

### Solucao

Substituir `fetchAllPages` por um loop pagina-a-pagina que **grava e emite progresso a cada pagina**. Assim cada pagina e persistida imediatamente e o frontend recebe % em tempo real.

### 1. Edge Function `sync-entra-id` — refatorar para sync progressivo

Substituir o padrao "fetch all then upsert" por "fetch page, upsert page, send progress":

```text
Para cada recurso (apps, licencas, grupos):
  pagina = 1
  while (nextLink existe):
    fetch 1 pagina (999 itens)
    upsert imediatamente no banco
    send SSE com { phase, synced, message }
    pagina++
```

Mudancas especificas:
- **Remover** `fetchAllPages` generico para apps e grupos
- **Novo** `syncPaged` que faz fetch + upsert + SSE por pagina
- Apps: fetch pagina → upsert cada app → SSE com contagem
- Grupos: fetch pagina → upsert cada grupo → SSE com contagem
- Licencas: ja funciona (subscribedSkus nao pagina, retorna tudo de uma vez)
- Emitir SSE com formato: `{ phase: "sync_grupos", synced: 450, page: 5, message: "450 grupos sincronizados..." }`

### 2. Frontend `PerfisAcessoPage.tsx` — mostrador de %

Adicionar estado `syncProgress` que exibe uma barra/texto de progresso durante o sync:

- Capturar eventos SSE de cada fase e exibir progresso inline (ex: "Sincronizando grupos: 450 itens...")
- Mostrar um `Progress` bar ou texto com contagem ao lado do botao de sync
- Remover qualquer timeout no fetch (ja nao tem, mas garantir que nao haja `AbortController` com timeout)

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-entra-id/index.ts` |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` |

