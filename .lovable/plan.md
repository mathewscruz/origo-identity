

## Plano: Formatar labels de origem com capitalização correta

### Problema

Na listagem de colaboradores (`ColaboradoresPage.tsx`), o Badge de "Origem" exibe o valor cru do banco (ex: `manual`, `csv`, `entra_id`) sem formatação — tudo em minúsculas.

Na página de detalhe (`ColaboradorDetalhePage.tsx`), o campo "Origem" na ficha também exibe o valor cru sem label formatado.

### Correção

**`ColaboradoresPage.tsx` (linha ~499):** Substituir `{c.origem}` por um mapa de labels:

| Valor DB | Label formatado |
|---|---|
| `manual` | Manual |
| `csv` | CSV |
| `entra_id` | Entra ID |

**`ColaboradorDetalhePage.tsx` (linha ~415):** Aplicar o mesmo mapa de labels no campo "Origem" da ficha do colaborador.

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — adicionar mapa `origemLabels` e usar no Badge |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — aplicar label formatado na ficha |

