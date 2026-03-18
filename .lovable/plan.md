

## Plano: Reestruturar Perfis de Acesso (multi-app, sem sensibilidade)

### Mudanca principal

O perfil de acesso passa a representar um **cargo** (ex: "Especialista de Seguranca da Informacao") que pode ter **N aplicacoes** vinculadas. Ao atribuir esse perfil a um usuario, o sistema concede acesso a todas as apps do perfil. Ao trocar ou remover o perfil, revoga os acessos antigos e concede os novos.

### 1. Banco de dados

**Nova tabela `perfil_aplicacoes`** (many-to-many):
```sql
CREATE TABLE perfil_aplicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  aplicacao_id uuid NOT NULL REFERENCES aplicacoes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(perfil_id, aplicacao_id)
);
```
Com RLS seguindo o padrao existente (admin/operador insert/update/delete, todos select).

**Remover coluna `aplicacao_id`** de `perfis_acesso` (migrar dados existentes para a nova tabela antes).

**Remover coluna `sensibilidade`** de `perfis_acesso` (ou manter nullable com default para nao quebrar — mais seguro manter e ignorar na UI).

### 2. Frontend — `PerfisAcessoPage.tsx`

- Remover campo "Sensibilidade" do form e da tabela
- Substituir Select unico de "Aplicacao" por **multi-select com checkboxes** (lista de aplicacoes com toggle)
- No save: inserir/atualizar perfil, depois sincronizar `perfil_aplicacoes` (delete existing + insert selected)
- Na tabela de listagem: mostrar quantidade de apps ou lista com badges em vez de nome unico

### 3. Frontend — `PerfilAcessoDetalhePage.tsx`

- Remover exibicao de sensibilidade nos cards e badges
- Substituir "Aplicacao" unica por lista de aplicacoes vinculadas (com add/remove)
- No dialog de edicao: mesmo multi-select
- Aba "Composicao" pode ser substituida/complementada por aba "Aplicacoes" mostrando as apps vinculadas

### 4. Hook `useOrigoData.ts`

- Adicionar `usePerfilAplicacoes(perfilId)` para buscar apps de um perfil
- Ajustar `usePerfisAcesso` para fazer select com `perfil_aplicacoes(aplicacao_id, aplicacoes(nome))` em vez de `aplicacoes(nome)`

### 5. Logica de concessao/revogacao (preparacao)

Nao sera automatico por enquanto (conforme decidido antes), mas a estrutura precisa suportar o fluxo futuro:
- Quando um perfil e **atribuido** a um colaborador → sistema devera conceder acesso a todas as apps do perfil
- Quando o perfil e **trocado** → revogar apps do perfil antigo, conceder apps do novo
- Quando o perfil e **removido** → revogar todas as apps

Isso sera implementado na edge function `execute-rules` quando for ativado. Por ora, a UI de atribuicao (tab "Pessoas Atribuidas") apenas registra a relacao em `perfil_atribuicoes`.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Migration | Nova tabela `perfil_aplicacoes` + migrar dados + drop `aplicacao_id` |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Editar | `src/hooks/useOrigoData.ts` |

