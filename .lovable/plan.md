

## Plano: Separar Acessos Individuais em abas com paginacao

### O que sera feito

Na secao "Acessos Individuais" da pagina de detalhe do colaborador, substituir a tabela unica por um componente com 3 abas:

- **Licencas** — filtra `assign_license`
- **Grupos** — filtra `assign_group`  
- **Aplicacoes** — filtra `assign_app`

Cada aba tera sua propria tabela com paginacao (25 itens por pagina), usando o `TablePagination` e `usePagination` ja existentes no projeto.

### Alteracoes

**Editar `src/pages/colaboradores/ColaboradorDetalhePage.tsx`:**

1. Na secao "Acessos Individuais" (linha ~593), envolver o conteudo em um sub-`Tabs` com 3 `TabsTrigger` (Licencas, Grupos, Aplicacoes) mostrando contadores entre parenteses
2. Em cada `TabsContent`, renderizar a tabela filtrada pelo `action_type` correspondente
3. Adicionar estado de paginacao independente para cada aba (`pageLicencas`, `pageGrupos`, `pageApps`)
4. Usar `usePagination` para fatiar os dados e `TablePagination` no rodape de cada tabela
5. Manter o `EmptyState` quando a aba estiver vazia
6. Manter o botao "Revogar" e os badges de origem (Importado) em cada linha

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — abas + paginacao nos acessos individuais |

