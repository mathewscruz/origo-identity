## Diagnóstico

O "piscar" da página Cargos (e comportamento similar em outros módulos) tem **duas causas combinadas**:

1. **`useOrigoData.ts` linha 28** — todos os hooks de dados compartilham:
   ```ts
   const REFETCH_OPTS = { refetchOnWindowFocus: true, staleTime: 10000, refetchInterval: 30000 };
   ```
   Isso dispara refetch de TODA query a cada 30s e sempre que o usuário volta para a aba. Contradiz a regra do projeto "No automatic syncs; syncs are purely manual/on-demand". Afeta: cargos, áreas, empresas, localidades, colaboradores, terceiros, aplicações, perfis de acesso, licenças, eventos JML, exceções, revisões, alertas, auditoria, entra grupos/licenças, SharePoint, fila individual.

2. **`CargosPage.tsx` linhas 45-55** — um `useEffect` que depende de `cargos` refaz a consulta `cargo_perfis` toda vez que o array `cargos` muda (inclusive nos refetches em background dos 30s), trocando a referência do `cargoPerfisMap` e re-renderizando a tabela inteira.

Outros pontos com polling ativo:
- `Dashboard.tsx`: 5 queries com 60s + 1 com 30s.
- `NotificacoesBell.tsx`: `setInterval(fetchAlertas, 30000)`.
- `useModoOperacao.ts`: `refetchInterval: 30000`.
- `useSyncJobsCsv`: polling dinâmico (2s enquanto o job está `running`) — **intencional e correto**, mantém-se.

## Mudanças

### 1. `src/hooks/useOrigoData.ts`
Trocar `REFETCH_OPTS` por uma versão sem polling automático:
```ts
const REFETCH_OPTS = { refetchOnWindowFocus: false, staleTime: 60_000, refetchInterval: false as const };
```
Atualizações (invalidateQueries após save/delete) continuam funcionando normalmente porque já chamamos `qc.invalidateQueries(...)` após cada mutação.

### 2. `src/pages/configuracoes/CargosPage.tsx`
Substituir o `useState + useEffect` que busca `cargo_perfis` por um `useQuery` dedicado:
```ts
const { data: cargoPerfisRows } = useQuery({
  queryKey: ["cargo_perfis_counts"],
  queryFn: async () => (await supabase.from("cargo_perfis").select("cargo_id")).data ?? [],
});
const cargoPerfisMap = useMemo(() => { /* contagem por cargo_id */ }, [cargoPerfisRows]);
```
Invalidar `cargo_perfis_counts` no `handleSave` quando houver alterações.

### 3. `src/pages/Dashboard.tsx`
Remover os `refetchInterval` (60s/30s). O dashboard é uma tela de leitura — manter atualização apenas no carregamento e via um botão "Atualizar" já existente / `invalidateQueries`. (Se preferir manter polling no dashboard apenas, sinalize antes da implementação.)

### 4. `src/components/NotificacoesBell.tsx`
Remover o `setInterval(fetchAlertas, 30000)`. Buscar alertas:
- ao montar,
- ao abrir o popover do sino,
- após ações que geram alertas (já invalidamos `alertas` nesses pontos).

### 5. `src/hooks/useModoOperacao.ts`
Remover `refetchInterval: 30000`. O modo operação raramente muda; ler ao montar é suficiente. Quem altera o parâmetro já invalida a query.

### 6. Não muda
- `useSyncJobsCsv` (polling 2s só durante execução de job — correto).
- Lógica de invalidação após mutações em todas as páginas.

## Resultado esperado
- Cargos (e demais listas) deixam de recarregar sozinhos a cada 30s ou ao trocar de aba.
- Skeletons só aparecem no primeiro carregamento.
- Dados continuam frescos porque toda mutação já invalida a query correspondente.
