

## Plano: Remover card "Alertas de Terceiros" e fixar 45 dias no backend

### Problema

Existe um card "Alertas de Terceiros" com campo configurável de 30 dias na página de Parâmetros. Esse campo não será mais utilizado — a revalidação de terceiros já é fixa em 45 dias no backend (`auto-recertification`).

### Alterações

**1. Remover card "Alertas de Terceiros" (`ParametrosPage.tsx`):**
- Remover linhas 95-106 (card inteiro com título "Alertas de Terceiros" e input de dias)

**2. Confirmar backend fixo em 45 dias (`auto-recertification/index.ts`):**
- O PART 3 já usa `daysSinceBase < 45` hardcoded — nenhuma alteração necessária no backend

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/configuracoes/ParametrosPage.tsx` — remover card "Alertas de Terceiros" |

