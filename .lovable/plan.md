

## Plano: Licencas Microsoft + Grupos Entra ID no Perfil de Acesso + Desativacao automatica

### 3 entregas

### 1. Banco de dados — novas tabelas

**`entra_licencas`** — cache local das licencas Microsoft (SKUs):
```sql
CREATE TABLE entra_licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  em_uso integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**`entra_grupos`** — cache local dos grupos do Entra ID:
```sql
CREATE TABLE entra_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**`perfil_licencas`** — many-to-many perfil → licencas:
```sql
CREATE TABLE perfil_licencas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  licenca_id uuid NOT NULL REFERENCES entra_licencas(id) ON DELETE CASCADE,
  UNIQUE(perfil_id, licenca_id)
);
```

**`perfil_grupos`** — many-to-many perfil → grupos:
```sql
CREATE TABLE perfil_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES entra_grupos(id) ON DELETE CASCADE,
  UNIQUE(perfil_id, grupo_id)
);
```

RLS padrao (admin/operador write, todos select).

### 2. Edge function `sync-entra-id` — expandir

Alem de sincronizar aplicacoes, agora tambem sincroniza:
- **Licencas (subscribedSkus)**: `GET /subscribedSkus` → upsert em `entra_licencas` com `skuPartNumber` como nome, `prepaidUnits.enabled` como total, `consumedUnits` como em_uso
- **Grupos**: `GET /groups?$select=id,displayName,description` → upsert em `entra_grupos`

### 3. Frontend — Perfil de Acesso (dialog e detalhe)

No dialog de criar/editar perfil (`PerfisAcessoPage.tsx` e `PerfilAcessoDetalhePage.tsx`):
- Adicionar secao **"Licencas Microsoft"** com multi-select checkbox (mostrando nome + disponivel/total)
- Adicionar secao **"Grupos Entra ID"** com multi-select checkbox
- **Corrigir layout do dialog**: aumentar `sm:max-w-lg` para `sm:max-w-2xl` e usar tabs internas (Geral | Aplicacoes | Licencas | Grupos) para organizar melhor o conteudo

Na detalhe page, adicionar tabs "Licencas" e "Grupos" mostrando os itens vinculados.

### 4. Edge function `disable-entra-user` — nova

Quando um colaborador muda para status != "ativo":
- Chama `PATCH /users/{entra_id}` com `{ accountEnabled: false }` — **nunca deleta**
- Para apps sem SSO, registra na tabela `perfil_atribuicoes` como revogado

Essa function sera chamada pelo frontend ao salvar o colaborador com status diferente de "ativo" (ou pode ser automatizada futuramente via trigger).

### 5. Hooks novos em `useOrigoData.ts`

- `useEntraLicencas()` — busca `entra_licencas`
- `useEntraGrupos()` — busca `entra_grupos`

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Migration | 4 novas tabelas + RLS |
| Editar | `supabase/functions/sync-entra-id/index.ts` (add licencas + grupos) |
| Criar | `supabase/functions/disable-entra-user/index.ts` |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` (dialog layout + licencas/grupos) |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` (tabs + licencas/grupos) |or
| Editar | `src/hooks/useOrigoData.ts` (novos hooks) |
| Editar | `src/pages/colaboradores/ColaboradorDet    

