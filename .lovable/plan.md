

## Plano: Reestruturar fluxo — Perfil → Cargo → Colaborador

### Conceito

O fluxo passa a ser hierarquico:

```text
Perfil de Acesso (apps, licencas, permissoes)
        ↓  vinculado a
     Cargo (pode ter N perfis)
        ↓  atribuido ao
   Colaborador (tem 1 cargo)
        ↓  ao salvar
   Sistema provisiona acessos automaticamente
```

### 1. Banco de dados — nova tabela `cargo_perfis`

```sql
CREATE TABLE cargo_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id uuid NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
  perfil_id uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cargo_id, perfil_id)
);
```

Com RLS seguindo o padrao existente (admin/operador write, todos select).

### 2. `CargosPage.tsx` — Atribuir perfis ao cargo

No dialog de criar/editar cargo, adicionar **multi-select de perfis de acesso** (mesmo padrao do multi-select de apps no perfil). Ao salvar o cargo, sincronizar `cargo_perfis`.

Na tabela de listagem, mostrar quantos perfis estao vinculados ao cargo.

### 3. `ColaboradorDetalhePage.tsx` — Ao salvar cargo, provisionar acessos

Quando o usuario muda o cargo do colaborador e clica "Salvar":
- Buscar os perfis vinculados ao novo cargo (via `cargo_perfis`)
- Revogar `perfil_atribuicoes` do cargo antigo (marcar `ativo=false`)
- Criar novas `perfil_atribuicoes` com `origem='cargo'` para os perfis do novo cargo
- Mostrar toast com resumo das mudancas

### 4. `ColaboradoresPage.tsx` — Mesmo comportamento no CRUD

Ao criar/editar colaborador e selecionar cargo, o save ja dispara a mesma logica de provisionar os perfis do cargo.

### 5. Hooks — `useCargosPerfis`

Novo hook em `useOrigoData.ts` para buscar perfis vinculados a um cargo.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Migration | Nova tabela `cargo_perfis` |
| Editar | `src/pages/configuracoes/CargosPage.tsx` |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |
| Editar | `src/hooks/useOrigoData.ts` |

