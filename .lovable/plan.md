

# Plano: Corrigir sync-sharepoint-sites para funcionar com as permissoes atuais

## Diagnostico

O log mostra 403 no endpoint `GET /sites?search=*`. Analisando a screenshot de permissoes:
- **`Sites.FullControl.All`** esta sob **Microsoft Graph** (Aplicativo) — recem-adicionado
- **`Sites.Read.All`** esta sob **SharePoint** (nao Microsoft Graph)

O endpoint Graph API `/v1.0/sites?search=*` precisa de permissoes **Microsoft Graph**, nao SharePoint. O `Sites.FullControl.All` cobre isso, mas como foi recem-concedido, pode levar ate 30 minutos para propagar.

## Correcoes

### 1. Adicionar endpoint alternativo com fallback
- Tentar primeiro `GET /sites/getAllSites` (endpoint mais recente e confiavel para listar todos os sites)
- Se falhar, tentar `GET /sites?search=*` como fallback
- Adicionar log do token (scopes) para diagnostico

### 2. Melhorar logs de erro
- Logar os scopes do token obtido para confirmar que `Sites.FullControl.All` esta presente
- Retornar mensagem mais descritiva na resposta de erro (incluindo qual endpoint falhou e por que)

### 3. Adicionar `Sites.Read.All` no Microsoft Graph (recomendacao ao usuario)
- A permissao `Sites.Read.All` atual esta apenas no escopo **SharePoint**, nao no **Microsoft Graph**
- Recomendavel adicionar `Sites.Read.All` tambem no Microsoft Graph para redundancia

## Arquivo impactado
| Arquivo | Alteracao |
|---|---|
| `supabase/functions/sync-sharepoint-sites/index.ts` | Fallback de endpoint + logs melhorados |

## Resultado esperado
A funcao tentara o endpoint mais confiavel primeiro e tera logs claros para diagnostico caso a propagacao da permissao ainda nao tenha concluido.

