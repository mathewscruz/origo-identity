

## Plano: Formatar todos os status sem capitalização no sistema

### Problema

Vários módulos exibem valores de status crus do banco (ex: `pendente`, `executado`, `pending`, `success`, `failed`, `em_andamento`, `ativa`, `inativa`) sem formatação — tudo em minúsculas ou com underscores.

### Locais afetados

| Arquivo | Campo | Valores crus exibidos |
|---|---|---|
| `Dashboard.tsx` (linha 236) | `item.status` (iam_queue) | `pending`, `processing`, `success`, `failed` |
| `EventoJMLDetalhePage.tsx` (linhas 47, 103) | `evento.status`, `a.status` (ações) | `pendente`, `executado`, `erro` |
| `EventosJMLPage.tsx` (linha 95) | `ev.status` | `pendente`, `executado`, `erro` |
| `FilaProvisionamentoPage.tsx` (linha 354) | `ev.status` (aba JML) | `pendente`, `executado`, `erro` |
| `ExcecoesPage.tsx` (linha 267) | `ex.status` | `pendente`, `aprovada`, `rejeitada`, `expirada` |
| `RevisoesPage.tsx` (linha 168) | `r.status` | `em_andamento`, `concluida` (usa `.replace(/_/g, " ")` mas sem capitalização) |
| `RevisaoDetalhePage.tsx` (linha 47) | `revisao.status` | Mesmo problema |
| `RegrasPage.tsx` (linha 59) | `regra.status` | `ativa`, `inativa` |
| `ColaboradorDetalhePage.tsx` (linha 533) | `item.status` (individuais) | `pending`, `success`, `failed` |
| `ColaboradorDetalhePage.tsx` (linha 570) | `ev.status` (timeline JML) | `pendente`, `executado`, `erro` |
| `AplicacaoDetalhePage.tsx` (linha 170) | `c.colaboradores.status` | `ativo`, `inativo`, `desligado` |

### Correção

Adicionar mapas de labels formatados em cada arquivo afetado:

**Status IAM Queue:** `pending` → "Pendente", `processing` → "Processando", `success` → "Concluído", `failed` → "Falhou"

**Status Eventos JML:** `pendente` → "Pendente", `executado` → "Executado", `erro` → "Erro"

**Status Exceções:** `pendente` → "Pendente", `aprovada` → "Aprovada", `rejeitada` → "Rejeitada", `expirada` → "Expirada"

**Status Revisões:** `em_andamento` → "Em Andamento", `concluida` → "Concluída"

**Status Regras:** `ativa` → "Ativa", `inativa` → "Inativa"

**Status Colaboradores:** `ativo` → "Ativo", `inativo` → "Inativo", `desligado` → "Desligado", `afastado` → "Afastado"

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/Dashboard.tsx` — label map para status da fila |
| Editar | `src/pages/eventos-jml/EventoJMLDetalhePage.tsx` — labels para evento e ações |
| Editar | `src/pages/eventos-jml/EventosJMLPage.tsx` — labels para status JML |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — labels na aba JML |
| Editar | `src/pages/excecoes/ExcecoesPage.tsx` — labels para exceções |
| Editar | `src/pages/revisoes/RevisoesPage.tsx` — labels capitalizados para revisões |
| Editar | `src/pages/revisoes/RevisaoDetalhePage.tsx` — label capitalizado |
| Editar | `src/pages/regras/RegrasPage.tsx` — labels para regras |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — labels nas seções individuais e JML |
| Editar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` — label para status do colaborador |

