

# Plano: Aba SharePoint nos Perfis de Acesso

## Objetivo
Adicionar uma aba "SharePoint" nos perfis de acesso, permitindo definir quais sites e pastas (2 niveis hierarquicos) cada perfil pode acessar, com tipo de permissao (leitura, escrita, controle total).

## Arquitetura

```text
perfis_acesso
  └── perfil_sharepoint_sites (vincula perfil → site + pasta nivel1 + pasta nivel2 + permissao)
        └── sharepoint_sites (catalogo de sites sincronizados do Graph API)
```

## Tabelas novas (migration)

### 1. `sharepoint_sites` — Catalogo de sites do tenant
| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid PK | |
| site_id | text UNIQUE | ID do site no Graph API |
| nome | text | Display name |
| url | text | Web URL |
| created_at | timestamptz | |

### 2. `sharepoint_pastas` — Pastas/drives dentro de sites (2 niveis)
| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid PK | |
| site_db_id | uuid | FK para sharepoint_sites |
| drive_item_id | text | ID do item no Graph |
| nome | text | Nome da pasta |
| caminho | text | Caminho completo |
| parent_id | uuid NULL | NULL = nivel 1, preenchido = nivel 2 |
| created_at | timestamptz | |

### 3. `perfil_sharepoint` — Vinculo perfil → site/pasta + permissao
| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid PK | |
| perfil_id | uuid | |
| site_id | uuid | FK sharepoint_sites |
| pasta_nivel1_id | uuid NULL | FK sharepoint_pastas (opcional) |
| pasta_nivel2_id | uuid NULL | FK sharepoint_pastas (opcional) |
| permissao | text | 'leitura', 'escrita', 'controle_total' |
| created_at | timestamptz | |

RLS: mesmo padrao das demais tabelas (admin/operador para CUD, authenticated para SELECT).

## Edge Function: `sync-sharepoint-sites`
- Autentica via Graph API (mesmas credenciais Azure ja configuradas)
- Lista sites do tenant via `GET /sites?search=*`
- Para cada site, lista drives e pastas do root ate 2 niveis
- Upsert em `sharepoint_sites` e `sharepoint_pastas`
- Retorna contagem de sites/pastas sincronizados

## Alteracoes no Frontend

### `PerfilAcessoDetalhePage.tsx`
1. **Nova aba "SharePoint"** na visualizacao — mostra sites/pastas vinculados com permissao
2. **Nova aba "SharePoint"** no dialog de edicao — seletor hierarquico:
   - Selecionar site (dropdown/busca)
   - Selecionar pasta nivel 1 (opcional, carrega ao selecionar site)
   - Selecionar pasta nivel 2 (opcional, carrega ao selecionar pasta nivel 1)
   - Selecionar permissao (leitura / escrita / controle_total)
   - Botao "Adicionar" → lista editavel com os vinculos
3. **Card de contagem** — adicionar card "SharePoint" ao grid de metricas

### `useOrigoData.ts`
- `useSharepointSites()` — lista sites do catalogo
- `useSharepointPastas(siteDbId)` — lista pastas por site

### `IntegracoesPage.tsx`
- Adicionar botao "Sincronizar Sites SharePoint" para popular o catalogo

## Fluxo do usuario
1. Admin vai em Integracoes → clica "Sincronizar Sites SharePoint" → popula catalogo
2. Admin edita um Perfil de Acesso → aba SharePoint → adiciona site + pasta + permissao
3. Colaborador com cargo vinculado a esse perfil herda a visibilidade do SharePoint

## Arquivos impactados
| Arquivo | Alteracao |
|---|---|
| Migration SQL | 3 tabelas + RLS |
| `supabase/functions/sync-sharepoint-sites/index.ts` | Nova edge function |
| `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` | Aba SharePoint (view + edit) |
| `src/hooks/useOrigoData.ts` | Hooks para sites e pastas |
| `src/pages/configuracoes/IntegracoesPage.tsx` | Botao de sync |

## Nota sobre provisionamento
Nesta fase, o vinculo SharePoint no perfil serve para **governanca e visibilidade** (saber quem tem acesso a que). O provisionamento automatico de permissoes SharePoint via Graph API pode ser adicionado futuramente como um `action_type` adicional no `iam_queue` (ex: `assign_sharepoint_permission` / `remove_sharepoint_permission`).

