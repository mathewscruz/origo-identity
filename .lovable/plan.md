

## Plano: Criar usuario no Entra ID ao criar colaborador manual

### Problema identificado

O fluxo interno funcionou perfeitamente:
- Evento JML "joiner" criado
- Perfil "Especialista em Seguranca da Informacao" provisionado via cargo

Porem, `entra_id` esta `null` porque **nao existe logica para criar o usuario no Microsoft Entra ID**. A edge function `disable-entra-user` apenas desativa/ativa usuarios existentes.

### Solucao

Criar uma nova edge function `provision-entra-user` que:
1. Recebe `colaborador_id`
2. Busca dados do colaborador (nome, email)
3. Cria o usuario no Entra ID via Graph API `POST /users`
4. Salva o `entra_id` retornado na tabela `colaboradores`
5. Atribui as licencas e grupos do perfil de acesso provisionado
6. Registra na auditoria

Chamar essa funcao automaticamente no `handleSave` de `ColaboradoresPage.tsx` ao criar um colaborador manual com status "ativo".

### Mudancas

#### 1. Nova edge function `supabase/functions/provision-entra-user/index.ts`

- Obtem token Azure via client credentials (mesma logica existente)
- `POST https://graph.microsoft.com/v1.0/users` com:
  - `accountEnabled: true`
  - `displayName`, `mailNickname`, `userPrincipalName` (email)
  - `passwordProfile` com senha temporaria e `forceChangePasswordNextSignIn: true`
- Salva `entra_id` (objectId retornado) no colaborador
- Busca `perfil_atribuicoes` ativas do colaborador, e para cada perfil busca `perfil_aplicacoes` para obter os grupos/licencas
- Atribui licencas via `POST /users/{id}/assignLicense`
- Adiciona a grupos via `POST /groups/{groupId}/members/$ref`
- Registra tudo na auditoria

#### 2. `supabase/config.toml` — registrar nova function

Adicionar `[functions.provision-entra-user]` com `verify_jwt = false`.

#### 3. `ColaboradoresPage.tsx` — chamar provisioning ao criar

Apos criar colaborador manual com status "ativo" e provisionar acessos do cargo, chamar `provision-entra-user` para criar no Entra ID e atribuir licencas/grupos.

#### 4. Atualizar `ColaboradorActivityPopover` 

Mostrar status do provisionamento Entra ID (criado, licencas atribuidas, grupos adicionados) no popover de atividades — usando dados da auditoria.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/provision-entra-user/index.ts` |
| Editar | `supabase/config.toml` |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |
| Editar | `src/components/ColaboradorActivityPopover.tsx` |

