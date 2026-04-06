

## Verificacao End-to-End do Fluxo IGA em Modo Simulacao

Analisei todos os modulos envolvidos. Identifiquei **8 problemas** que impedem o funcionamento completo.

---

### Problemas Encontrados

#### 1. `sam_account_name` nao e persistido na tabela `colaboradores`

A coluna `sam_account_name` nao existe na tabela `colaboradores` (conferido no schema). O campo e capturado no formulario mas **nunca e salvo** no banco — o `payload` de insert/update (linhas 149-161) nao inclui `sam_account_name`. Isso significa que ao editar um colaborador existente, o campo volta vazio e todos os payloads de `update`/`disable` vao com `samAccountName: ""`.

**Correcao**: Adicionar coluna `sam_account_name text` na tabela `colaboradores` (migracao). Incluir no payload de insert/update. No `openEdit`, carregar o valor salvo.

#### 2. Edicao de colaborador nao carrega `sam_account_name`

Na funcao `openEdit` (linha 133), `sam_account_name` e sempre inicializado como `""`. Mesmo que a coluna exista, o valor nao seria carregado porque o `mapped` nao inclui esse campo.

**Correcao**: Adicionar `sam_account_name` ao `mapped` e ao `openEdit`.

#### 3. Exclusao de colaborador usa `matricula` como identidade AD

Na funcao `handleDelete` (linha 356), o payload usa `samAccountName: deletingColab.matricula || deletingColab.email` — viola a regra de identidade unica. Deveria usar `sam_account_name`.

**Correcao**: Usar `sam_account_name` do colaborador.

#### 4. Terceiros: edicao nao gera `iam_queue` para disable/update

Ao editar um terceiro e mudar `ativo` de true para false, **nenhuma solicitacao de desativacao e gerada** na `iam_queue`. O sistema apenas atualiza o registro.

**Correcao**: Detectar mudanca de `ativo` e gerar `iam_queue` com `action_type: "disable"` quando desativado.

#### 5. Terceiros: exclusao nao gera `iam_queue`

`handleDelete` em `TerceirosPage.tsx` (linha 102) apenas deleta do banco sem gerar `iam_queue` para desativar no AD.

**Correcao**: Antes de deletar, buscar `sam_account_name` e gerar `iam_queue` com `action_type: "disable"`.

#### 6. Terceiros: atribuicao de perfil nao gera `iam_queue`

Em `TerceiroDetalhePage.tsx`, `handleAtribuirPerfil` (linha 72) cria a atribuicao mas **nao gera entradas na `iam_queue`** para grupos/licencas do Entra ID. A funcao `provisionCargoAcessos` nao e chamada para terceiros.

**Correcao**: Ao atribuir perfil, consultar `perfil_grupos` e `perfil_licencas` e gerar `iam_queue` entries para `assign_group`/`assign_license`. Ao revogar, gerar `remove_group`/`remove_license`.

#### 7. Fila de Provisionamento nao mostra novos action_types

`FilaProvisionamentoPage.tsx` e `SolicitacaoDetalhePage.tsx` so mapeiam `create`, `update`, `disable`, `delete`. Faltam: `create_if_not_exists`, `assign_group`, `remove_group`, `assign_license`, `remove_license`.

**Correcao**: Adicionar os novos tipos ao `actionConfig` em ambas as paginas.

#### 8. Revisao Externa: revogacao nao gera `iam_queue`

Em `RevisaoExternaPage.tsx` (linha 76-81), ao revogar um acesso, o sistema desativa a `perfil_atribuicoes` mas **nao gera `iam_queue`** para remover o grupo/licenca no Entra ID.

**Correcao**: Apos revogar, consultar `perfil_grupos` e `perfil_licencas` do perfil e gerar entries `remove_group`/`remove_license`.

---

### Resumo de Alteracoes

| Acao | Arquivo |
|---|---|
| Migracao | Adicionar `sam_account_name text` em `colaboradores` |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — persistir sam_account_name, carregar no edit, corrigir delete |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — gerar iam_queue em disable/delete |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — gerar iam_queue ao atribuir/revogar perfil |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — adicionar novos action_types |
| Editar | `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` — adicionar novos action_types |
| Editar | `src/pages/revisoes/RevisaoExternaPage.tsx` — gerar iam_queue ao revogar |

### Ordem de implementacao

1. Migracao `sam_account_name` em `colaboradores`
2. Corrigir `ColaboradoresPage.tsx` (persistir, carregar, delete)
3. Corrigir `TerceirosPage.tsx` (disable/delete)
4. Corrigir `TerceiroDetalhePage.tsx` (iam_queue para perfis)
5. Corrigir `RevisaoExternaPage.tsx` (iam_queue ao revogar)
6. Atualizar mapeamento de action_types na fila

