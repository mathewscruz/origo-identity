

# Plano: Filtrar sites SharePoint principais e melhorar UX de seleção

## Diagnóstico
A sincronização está funcionando corretamente — importou 4.594 sites, incluindo "Segurança da Informação". Porém:
- **3.418 sites são pessoais** (OneDrive, URLs com `-my.sharepoint.com`) — devem ser excluídos
- Os 1.174 sites restantes são sites reais (`/sites/...`)
- Os campos de pasta já aparecem condicionalmente após selecionar um site (código OK), mas o volume de sites pessoais polui a lista

## Solução

### 1. Edge Function: filtrar sites pessoais na importação
Modificar `sync-sharepoint-sites/index.ts` para excluir sites com URL contendo `-my.sharepoint.com` (OneDrive pessoal) antes do upsert. Isso reduz de ~4.600 para ~1.174 sites.

### 2. Limpar sites pessoais já importados
Criar uma migration para deletar os registros existentes de sites pessoais da tabela `sharepoint_sites`.

### 3. Frontend: adicionar busca no select de sites
Com ~1.174 sites, o dropdown ainda é grande. Adicionar um campo de busca/filtro dentro do Select de sites no `PerfisAcessoPage.tsx` e `PerfilAcessoDetalhePage.tsx` para facilitar a localização.

### 4. Confirmar que pastas só aparecem após seleção
O código atual já condiciona os campos de pasta a `spNewSite` estar preenchido (linha 535). Nenhuma alteração necessária neste ponto.

## Arquivos impactados
| Arquivo | Alteração |
|---|---|
| `supabase/functions/sync-sharepoint-sites/index.ts` | Filtrar URLs `-my.sharepoint.com` antes do upsert |
| Migration SQL | `DELETE FROM sharepoint_sites WHERE url LIKE '%-my.sharepoint.com/%'` |
| `src/pages/perfis-acesso/PerfisAcessoPage.tsx` | Adicionar busca no Select de sites |
| `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` | Mesmo ajuste de busca |

## Resultado esperado
- Apenas sites SharePoint reais (~1.174) aparecem para seleção
- Campo de busca facilita encontrar sites como "Segurança da Informação"
- Pastas só aparecem após selecionar um site (já funciona)

