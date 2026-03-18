

## Plano: Adicionar atribuicao de aplicativos no provisionamento Entra ID

### Diagnostico

Analisei os dados e os logs de auditoria:

- **Licencas**: Funcionou corretamente (1 licenca atribuida ao "Mathews teste 2")
- **Grupos**: O perfil atribuido nao possui nenhum grupo vinculado na tabela `perfil_grupos` — nao e bug, e configuracao do perfil
- **Apps**: O perfil possui 2 apps vinculados (Docusign) via `perfil_aplicacoes`, com `entra_id` configurado. Porem, **a edge function nao possui logica para atribuir aplicativos** — so faz licencas e grupos

### Solucao

Adicionar um passo 7 na edge function `provision-entra-user` para atribuir aplicativos via Graph API.

#### `supabase/functions/provision-entra-user/index.ts`

Apos o bloco de grupos, adicionar:

1. Buscar `perfil_aplicacoes` vinculados aos perfis ativos, com join em `aplicacoes` para obter o `entra_id` (service principal ID)
2. Para cada app com `entra_id`, chamar `POST /servicePrincipals/{appEntraId}/appRoleAssignments` com:
   - `principalId`: entra_id do usuario
   - `resourceId`: entra_id do app (service principal)  
   - `appRoleId`: `00000000-0000-0000-0000-000000000000` (default access)
3. Registrar sucesso/erro na auditoria
4. Retornar `apps_assigned` no response

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/provision-entra-user/index.ts` |

