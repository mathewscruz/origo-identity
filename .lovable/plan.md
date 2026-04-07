

## Plano: Atribuição individual de Grupo, Licença e App ao colaborador

### Situação atual

A página `ColaboradorDetalhePage.tsx` permite apenas atribuir **Perfis de Acesso** completos. Não há opção de adicionar um grupo Entra, uma licença ou uma aplicação de forma individual. Toda individualidade precisa passar por um perfil, o que não atende cenários onde o colaborador precisa de um recurso pontual.

### O que será implementado

Na aba "Acessos Ativos", adicionar um dropdown no botão "Atribuir" com 4 opções:
- **Atribuir Perfil** (existente)
- **Adicionar Grupo** — seleciona um grupo da tabela `entra_grupos`
- **Adicionar Licença** — seleciona uma licença da tabela `entra_licencas`
- **Adicionar App** — seleciona uma app da tabela `aplicacoes`

Cada atribuição individual gera diretamente uma entrada na `iam_queue` com o `action_type` correspondente (`assign_group`, `assign_license`, `assign_app`) sem criar perfil_atribuicoes, pois são recursos avulsos.

Uma nova seção "Acessos Individuais" será exibida abaixo da tabela de perfis, listando as entradas da `iam_queue` desse colaborador com `action_type` de assign que não vieram de um perfil (filtrando por `requested_by = 'manual_individual'`). Isso permite visualizar e revogar recursos individuais.

### Detalhes técnicos

**Dialog de atribuição individual:** 3 dialogs separados (ou um com tabs), cada um com um Select buscando dados dos hooks existentes (`useEntraGrupos`, `useEntraLicencas`, `useAplicacoes`).

**Geração de queue:** Usa `generateEntraQueueForDiff` do `entraQueueHelper.ts` com o diff contendo apenas o recurso selecionado, marcando `requested_by: 'manual_individual'` para diferenciar de atribuições via perfil.

**Seção de visualização:** Query na `iam_queue` filtrando `colaborador_id = id` e `requested_by = 'manual_individual'` para listar recursos individuais com status e opção de revogar (gerando a ação inversa).

**Revogação individual:** Ao clicar "Revogar" em um item individual, gera a ação inversa (`remove_group`, `remove_license`, `remove_app`) na `iam_queue`.

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — dropdown, dialogs, seção individuais |
| Editar | `src/hooks/useOrigoData.ts` — hook para buscar iam_queue por colaborador |

