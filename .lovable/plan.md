

## Plano: Responsividade global do sistema

### Problema

Tabelas com muitas colunas e layouts fixos causam scrolls horizontais e verticais em telas menores. Filtros, botões e grids não se adaptam bem a resoluções reduzidas.

### Estratégia

Aplicar melhorias de responsividade em 3 camadas:

1. **Layout principal** — ajustar `main` para padding reduzido em mobile
2. **Cabeçalhos de página** — empilhar título e botões verticalmente em telas pequenas
3. **Tabelas** — ocultar colunas menos importantes em telas menores via classes `hidden md:table-cell`
4. **Filtros** — garantir que todos usem `flex-wrap` e larguras relativas
5. **Dialogs/formulários** — usar `grid-cols-1` em mobile, `grid-cols-2` em desktop

### Alterações por arquivo

**1. `src/components/AppLayout.tsx`**
- Trocar `p-6` por `p-3 md:p-6` no `<main>`
- Header: ajustar gap para telas menores

**2. `src/pages/colaboradores/ColaboradoresPage.tsx`**
- Cabeçalho: `flex-wrap` nos botões
- Tabela: ocultar colunas CPF, Área, Origem em mobile (`hidden md:table-cell`)
- Filtros: já usa `flex-wrap`, ajustar `min-w` dos selects

**3. `src/pages/terceiros/TerceirosPage.tsx`**
- Ocultar colunas Empresa, Responsável em mobile
- Cabeçalho com `flex-wrap`

**4. `src/pages/solicitacoes/SolicitacoesPage.tsx`**
- Cabeçalho: `flex-wrap` nos botões
- Tabela: ocultar coluna Justificativa em mobile
- Cards de status: `grid-cols-1 sm:grid-cols-3`

**5. `src/pages/portal/PortalSolicitacoesPage.tsx`**
- Cards: `grid-cols-2 sm:grid-cols-4` (já ok)
- Tabela: ocultar Justificativa e Comentário em mobile

**6. `src/pages/Dashboard.tsx`**
- KPIs: `grid-cols-2 md:grid-cols-4` (já ok)
- Gráficos: `lg:grid-cols-7` → adicionar `grid-cols-1` base

**7. `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx`**
- Ocultar colunas secundárias em mobile

**8. `src/pages/aplicacoes/AplicacoesPage.tsx`**
- Ocultar colunas Tipo, Responsável em mobile

**9. `src/pages/perfis-acesso/PerfisAcessoPage.tsx`**
- Counters: `grid-cols-1 sm:grid-cols-3`
- Tabela: ocultar Tipo em mobile

**10. `src/pages/licencas/LicencasPage.tsx`**
- Ocultar colunas secundárias em mobile

**11. `src/pages/privilegiados/PrivilegiadosPage.tsx`**
- Cards: `grid-cols-2 md:grid-cols-4`

**12. `src/pages/configuracoes/CargosPage.tsx`, `EmpresasPage.tsx`, `OperadoresPage.tsx`**
- Ajustar tabelas e dialogs para responsividade

**13. `src/pages/matriz/MatrizPage.tsx`**
- Manter `overflow-x-auto` (matriz é intrinsecamente larga), mas reduzir padding em mobile

**14. `src/index.css`**
- Adicionar classe utilitária `.responsive-table` para ocultar colunas via `@apply`

### Padrão aplicado em todas as tabelas

```text
Colunas sempre visíveis: Nome/Título, Status, Ações
Colunas ocultas em mobile: campos secundários (CPF, Área, Origem, Tipo, etc.)
Classe: hidden md:table-cell (no <th> e <td>)
```

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/components/AppLayout.tsx` — padding responsivo |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — colunas responsivas |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — colunas responsivas |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — layout responsivo |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — colunas responsivas |
| Editar | `src/pages/Dashboard.tsx` — grids responsivos |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — colunas responsivas |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — colunas responsivas |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` — grids e colunas responsivas |
| Editar | `src/pages/licencas/LicencasPage.tsx` — colunas responsivas |
| Editar | `src/pages/privilegiados/PrivilegiadosPage.tsx` — grids responsivos |
| Editar | `src/pages/configuracoes/CargosPage.tsx` — responsividade |
| Editar | `src/pages/configuracoes/EmpresasPage.tsx` — responsividade |
| Editar | `src/pages/configuracoes/OperadoresPage.tsx` — responsividade |

