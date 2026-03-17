

## Plano: Sincronização completa + Paginação global

### Problema 1: Limite de 1000 registros
O hook `useColaboradores` usa `supabase.from("colaboradores").select(...)` que retorna no maximo 1000 rows (limite padrao do Supabase). Existem 1341 colaboradores no banco. A solucao e paginar no lado do servidor buscando todos os registros.

### Problema 2: Sincronizacao morre ao sair da pagina
Atualmente o SSE stream e consumido no componente `IntegracoesPage`. Se o usuario navega para outra pagina, o componente desmonta e a leitura do stream para. A edge function continua executando no servidor, mas o frontend perde o acompanhamento. A solucao e:
- Criar uma tabela `sync_jobs` no banco para persistir o estado da sincronizacao (fase, progresso, contadores, erro)
- A edge function atualiza essa tabela conforme progride
- O frontend consulta essa tabela (polling) para mostrar progresso, independente de navegacao
- O SSE stream deixa de ser necessario no frontend

### Problema 3: Paginacao em todas as tabelas
Nenhuma tabela tem paginacao. Sao ~12 paginas com tabelas.

---

### Implementacao

#### 1. Criar tabela `sync_jobs`
Migration SQL:
```sql
CREATE TABLE public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running',
  phase text,
  message text,
  users_total int DEFAULT 0,
  users_created int DEFAULT 0,
  users_updated int DEFAULT 0,
  users_percent int DEFAULT 0,
  apps_total int DEFAULT 0,
  apps_created int DEFAULT 0,
  apps_updated int DEFAULT 0,
  apps_percent int DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
-- Policies similares as demais tabelas
```

#### 2. Refatorar a edge function `sync-entra-id`
- No inicio, inserir um registro em `sync_jobs` com status `running`
- Em vez de SSE, atualizar o registro da tabela a cada batch de progresso
- Retornar o `job_id` imediatamente como JSON (resposta rapida)
- A funcao continua processando em background (usando `waitUntil` ou simplesmente respondendo e depois continuando - **nota**: Deno.serve nao suporta background apos resposta, entao manter o SSE server-side mas o frontend nao precisa ficar ouvindo)

**Abordagem revisada**: Manter a edge function como esta (SSE), mas adicionar escritas na tabela `sync_jobs` conforme progride. O frontend inicia a chamada e, se o usuario navegar, o stream continua no servidor ate acabar. Ao voltar, o frontend le o estado da tabela `sync_jobs`.

#### 3. Refatorar `IntegracoesPage`
- Ao clicar "Sincronizar", chamar a edge function via `fetch` (fire-and-forget com AbortController)
- Iniciar polling da tabela `sync_jobs` para mostrar progresso
- Se ja existir um job `running`, mostrar o progresso dele
- Ao montar a pagina, verificar se ha job em andamento

#### 4. Corrigir limite de 1000 no `useOrigoData`
Para `useColaboradores` e qualquer hook que possa ter >1000 registros, implementar paginacao server-side:
```ts
async function fetchAll(table, select, order) {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    const { data } = await supabase.from(table).select(select).order(order).range(from, from + PAGE - 1);
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

#### 5. Componente reutilizavel `TablePagination`
Criar `src/components/TablePagination.tsx` usando os componentes de `pagination.tsx` existentes. Props: `totalItems`, `pageSize`, `currentPage`, `onPageChange`. Tamanho padrao: 25 itens por pagina.

#### 6. Adicionar paginacao a todas as paginas com tabela
Paginas afetadas (12):
- ColaboradoresPage
- AplicacoesPage
- TerceirosPage
- EventosJMLPage
- PerfisAcessoPage
- RegrasPage
- ExcecoesPage
- LicencasPage
- AuditoriaPage
- AlertasPage
- RevisoesPage
- EmpresasPage, CargosPage (config - menos prioritarias mas incluidas)

Cada pagina recebera: estado `page`, slice dos dados filtrados, componente `TablePagination` abaixo da tabela.

---

### Resumo de arquivos
- **Nova migration**: tabela `sync_jobs`
- **Novo**: `src/components/TablePagination.tsx`
- **Editar**: `supabase/functions/sync-entra-id/index.ts` (gravar progresso na tabela)
- **Editar**: `src/hooks/useOrigoData.ts` (fetchAll para colaboradores)
- **Editar**: `src/pages/configuracoes/IntegracoesPage.tsx` (polling em vez de SSE)
- **Editar**: 12+ paginas de listagem (adicionar paginacao)

