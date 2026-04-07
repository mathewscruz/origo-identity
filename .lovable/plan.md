

## Plano: Melhorias no módulo de Perfis de Acesso

### Problemas e inconsistências encontrados

**1. Código duplicado entre PerfisAcessoPage e PerfilAcessoDetalhePage**
O formulário de edição existe em DOIS lugares com lógica quase idêntica (sync de apps/licenças/grupos, cálculo de diff, provisionamento). Qualquer correção futura precisa ser feita em dois arquivos. A página de detalhe não tem busca nas listas de apps/licenças/grupos no dialog de edição (a listagem tem, o detalhe não).

**2. Tabela "Composição" é redundante**
A aba "Composição" na página de detalhe permite adicionar itens manuais (grupo, role, permissão, licença) de forma textual livre — mas o perfil JÁ tem abas estruturadas de Aplicações, Licenças e Grupos com dados reais do Entra ID. A composição era útil antes dessas abas existirem, agora gera confusão.

**3. Exclusão de perfil não faz cleanup no Entra ID**
Ao excluir um perfil (`handleDelete`), o sistema deleta o registro mas NÃO remove os grupos/licenças/apps dos colaboradores que tinham esse perfil. Ficam recursos órfãos no Entra ID.

**4. Listagem não mostra informações suficientes**
A tabela mostra apenas Nome, Aplicações, Tipo e Status. Falta: quantidade de pessoas atribuídas, quantidade de licenças/grupos, e cargos vinculados.

**5. Falta filtro por tipo e status na listagem**
Só existe busca por nome. Não há filtros por tipo (funcional/técnico/privilegiado) ou status (ativo/inativo).

**6. Pessoa na aba "Pessoas" não é clicável**
O nome do colaborador na aba Pessoas do detalhe não tem link para `/colaboradores/:id`.

**7. PerfisAcessoPage não chama triggerEntraProcessing após gerar a fila**
A `PerfisAcessoPage` gera entradas na `iam_queue` via `generateEntraQueueForDiff` (que por padrão chama `triggerEntraProcessing`), mas a `PerfilAcessoDetalhePage` chama `triggerEntraProcessing()` explicitamente depois E passa `triggerImmediately: false`. Inconsistência: na listagem o trigger é automático, no detalhe é manual — abordagens diferentes para o mesmo resultado.

### Melhorias propostas

#### A. Remover aba "Composição" (redundante)
- Remover a aba, o dialog e as funções `handleAddComp`/`handleDeleteComp`
- Remover o card contador "Composição" no header
- Simplifica a interface e elimina confusão

#### B. Adicionar busca nas listas do dialog de edição (PerfilAcessoDetalhePage)
- As listas de apps, licenças e grupos no dialog de edição da página de detalhe não têm campo de busca (a da listagem tem)
- Adicionar Input de busca em cada aba do dialog

#### C. Melhorar a listagem com mais colunas e filtros
- Adicionar colunas: "Pessoas" (contagem), "Licenças" (contagem), "Grupos" (contagem)
- Adicionar filtros por Tipo e Status
- Adicionar contadores no header (Total, Ativos, Privilegiados)

#### D. Tornar nomes de pessoas clicáveis
- Na aba "Pessoas" do detalhe, fazer o nome do colaborador ser um link para `/colaboradores/:id`

#### E. Cleanup no Entra ID ao excluir perfil
- Antes de deletar, buscar colaboradores afetados e gerar ações de `remove` na `iam_queue`
- Exibir confirmação com a quantidade de pessoas impactadas

#### F. Mostrar cargos vinculados no detalhe
- Adicionar uma aba ou seção "Cargos" mostrando quais cargos estão vinculados a este perfil (via `cargo_perfis`)
- Link para a página de configuração de cargos

### Arquivos a alterar

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` — filtros, colunas extras, cleanup ao excluir |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — remover composição, busca no dialog, aba cargos, links nas pessoas |

### Ordem de implementação

1. Remover composição e adicionar aba Cargos no detalhe
2. Adicionar busca no dialog de edição do detalhe
3. Tornar nomes de pessoas clicáveis
4. Melhorar listagem (filtros, colunas, contadores)
5. Adicionar cleanup de Entra ID ao excluir perfil

