

## Plano: Corrigir provisionamento de licencas e grupos no Entra ID

### Problema identificado

Dois problemas distintos:

1. **Licencas**: O erro do Graph API e claro: `"License assignment cannot be done for user with invalid usage location."` — ao criar o usuario no Entra ID, a funcao nao define o campo `usageLocation`, que e obrigatorio para atribuir licencas.

2. **Grupos**: O perfil de acesso atribuido ao colaborador nao possui nenhum grupo vinculado na tabela `perfil_grupos`. Isso nao e um bug do codigo — e uma questao de configuracao do perfil. O codigo de grupos funciona corretamente.

### Solucao

#### 1. `provision-entra-user/index.ts` — adicionar `usageLocation` ao criar usuario

Na chamada `POST /users` do Graph API, incluir o campo `usageLocation: "BR"` (Brasil). Idealmente, buscar esse valor de um parametro configuravel na tabela `parametros`.

Fluxo:
- Antes de criar o usuario, buscar o parametro `usage_location` da tabela `parametros` (default: `"BR"`)
- Incluir `usageLocation` no body do `POST /users`

#### 2. (Opcional) Adicionar retry para licencas apos falha

O Graph API as vezes precisa de alguns segundos apos a criacao do usuario para aceitar a atribuicao de licencas. Adicionar um `await new Promise(r => setTimeout(r, 3000))` entre a criacao do usuario e a atribuicao de licencas.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/provision-entra-user/index.ts` |

