

## Plano: Reprovisionar acessos Entra ID ao editar perfil ou cargo

### Contexto

Quando um perfil de acesso e editado (adicionando/removendo apps, licencas, grupos) ou um cargo e editado (mudando os perfis vinculados), os colaboradores que possuem aquele perfil/cargo nao recebem as atualizacoes no Entra ID. O sistema precisa reprocessar automaticamente.

### Solucao

Criar uma nova edge function `reprovision-entra-users` que recebe uma lista de `colaborador_ids` e sincroniza licencas, grupos e apps no Entra ID com base nos perfis ativos de cada colaborador. Chamar essa function automaticamente ao salvar edicoes em perfis de acesso e cargos.

### Arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/reprovision-entra-users/index.ts` |
| Editar | `supabase/config.toml` |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Editar | `src/pages/configuracoes/CargosPage.tsx` |

### Detalhes tecnicos

#### 1. Edge function `reprovision-entra-users`

Recebe `{ perfil_id?: string, cargo_id?: string }`.

Fluxo:
1. Se `perfil_id`: busca todos colaboradores com `perfil_atribuicoes.ativo=true` para esse perfil que tenham `entra_id` preenchido
2. Se `cargo_id`: busca todos colaboradores com esse `cargo_id` que tenham `entra_id` preenchido
3. Para cada colaborador encontrado:
   - Coleta todos os perfis ativos do colaborador (via `perfil_atribuicoes`)
   - Busca as licencas esperadas (`perfil_licencas` → `entra_licencas.sku_id`)
   - Busca os grupos esperados (`perfil_grupos` → `entra_grupos.entra_id`)
   - Busca os apps esperados (`perfil_aplicacoes` → `aplicacoes.entra_id`)
   - Obtem token Azure e sincroniza:
     - **Licencas**: `POST /users/{entraId}/assignLicense` com todas SKUs consolidadas
     - **Grupos**: `POST /groups/{groupId}/members/$ref` (ignora "already exists")
     - **Apps**: `POST /servicePrincipals/{appId}/appRoleAssignments` (ignora "already exists")
4. Registra na auditoria um resumo por colaborador

Retorna `{ total_users, processed, errors }`.

#### 2. `PerfilAcessoDetalhePage.tsx` — apos `handleSaveEdit`

Apos salvar o perfil com sucesso, chamar `reprovision-entra-users` com `{ perfil_id: id }` e mostrar toast com resultado.

#### 3. `CargosPage.tsx` — apos `handleSave` (edicao)

Quando editando um cargo e os perfis vinculados mudaram (`toRemove.length > 0 || toAdd.length > 0`), chamar `reprovision-entra-users` com `{ cargo_id: cargoId }` e mostrar toast.

#### 4. `config.toml`

Adicionar `[functions.reprovision-entra-users]` com `verify_jwt = false`.

