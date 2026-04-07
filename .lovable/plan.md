

## Plano: Licenças Microsoft + Licenças Externas

### Situacao atual

- A tabela `entra_licencas` existe com colunas `nome`, `sku_id`, `total`, `em_uso` mas nao e populada automaticamente
- A tabela `licencas` armazena licencas manuais com campos como `custo_unitario`, `renovacao`, `tipo`
- A pagina mostra apenas a tabela `licencas`
- Ja existem credenciais Azure configuradas (AZURE_TENANT_ID, CLIENT_ID, CLIENT_SECRET)

### Implementacao

#### 1. Edge Function `sync-entra-licencas`
Criar nova Edge Function que:
- Busca `GET /subscribedSkus` na Microsoft Graph API (retorna todas as licencas do tenant com `prepaidUnits.enabled` e `consumedUnits`)
- Faz upsert na tabela `entra_licencas` usando `sku_id` como chave
- Remove licencas que nao existem mais no tenant
- Reutiliza o padrao de auth e paginacao do `sync-entra-apps`

#### 2. Atualizar LicencasPage
- Adicionar hook `useEntraLicencas()` (ja existe em `useOrigoData.ts`)
- Unificar as duas listas em uma view com tabs/filtro: **Microsoft** | **Externas** | **Todas**
- Botao de sync (icone refresh) ao lado de "Nova Licenca" que chama a Edge Function
- Licencas Microsoft: read-only (total/em_uso vem do Azure), sem botoes editar/excluir
- Licencas Externas: editaveis como hoje, com botao "Nova Licenca" para adicionar manualmente
- Contadores no header: Total licencas, Microsoft, Externas, Criticas

#### 3. Coluna "Origem" visual
- Badge "Microsoft" (azul) ou "Externa" (outline) na tabela para diferenciar

### Arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/sync-entra-licencas/index.ts` |
| Editar | `src/pages/licencas/LicencasPage.tsx` — tabs, sync, unificacao |

