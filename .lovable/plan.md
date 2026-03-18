

## Plano: Buscar todos os grupos do Entra ID + campo de pesquisa nas abas

### Problema 1: Grupos incompletos

A Microsoft Graph API por padrao pode omitir certos tipos de grupos (distribution lists, mail-enabled security groups) sem o header `ConsistencyLevel: eventual`. Alem disso, o endpoint `/groups` sem filtro de tipo pode nao retornar todos. A correcao e:

- Adicionar header `ConsistencyLevel: eventual` e `$count=true` nas chamadas de grupos
- Remover o filtro `$select` restritivo e incluir `mailEnabled,securityEnabled,groupTypes` para visibilidade
- Garantir que o loop de paginacao nao para prematuramente

**Arquivo**: `supabase/functions/sync-entra-id/index.ts`

### Problema 2: Campo de pesquisa nas abas

Adicionar um `Input` de busca dentro de cada aba (Aplicacoes, Licencas, Grupos) do dialog de criar/editar perfil. Filtrar a lista localmente pelo texto digitado.

- 3 estados de busca independentes: `buscaApps`, `buscaLicencas`, `buscaGrupos`
- Input com icone de lupa acima da ScrollArea em cada aba
- Filtro case-insensitive no nome

**Arquivo**: `src/pages/perfis-acesso/PerfisAcessoPage.tsx`

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-entra-id/index.ts` |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` |

