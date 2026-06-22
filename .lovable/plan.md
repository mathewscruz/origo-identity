# Plano — Acessos Privilegiados confiável end-to-end

Objetivo: eliminar pontos cegos que hoje fazem a tela subestimar/poluir o risco real e dar visibilidade do frescor do dado.

## 1. Cobertura PIM (Privileged Identity Management)
Estender `sync-entra-roles` para ler também:
- `/roleManagement/directory/roleEligibilitySchedules` — atribuições **elegíveis** (pode ativar quando quiser).
- `/roleManagement/directory/roleAssignmentSchedules` — atribuições **ativas** (inclui ativações PIM temporárias com janela).

Mudanças no schema (`entra_role_members`):
- `assignment_type` enum: `permanente` | `elegivel` | `ativo_pim`
- `start_at` / `end_at` (nullable) para janelas PIM
- `directory_scope_id` (para roles escopadas em AU/app)

UI: nova coluna **Tipo de atribuição** (badge: Permanente / Elegível / Ativo PIM com contagem regressiva), filtro por tipo, e card extra "Elegíveis PIM".

## 2. Contas administrativas / breakglass
- Nova tabela leve `contas_admin_conhecidas` (entra_id, motivo, dono_responsavel) gerenciada via UI simples na própria página.
- Sync deixa de gerar alerta `privilegiado_nao_vinculado` quando o `user_entra_id` está nessa lista; em vez disso a linha mostra badge "Conta administrativa" com responsável.
- Match relaxado: também tenta `colaboradores` com qualquer status antes de cair para "não vinculado" (hoje só `ativo`).

## 3. Frescor do dado
- Persistir `last_sync_at` em `parametros` (chave `entra_roles_last_sync`).
- Header da página exibe "Última sincronização: há X min" + cor (verde <24h, âmbar <7d, vermelho >7d).
- Card "Sincronização" mostra duração do último job e status.

## 4. Parametrização de alertas
- Mover limite hardcoded "3 membros" para `parametros` (`priv_role_max_membros`, default 3) editável em Configurações.

## 5. Drill-down reverso
- Na ficha do colaborador (`/colaboradores/:id`), nova seção **Funções Privilegiadas** listando todas as roles (ativas + elegíveis) com tipo de atribuição.

## 6. Tipagem
- Regenerar `src/integrations/supabase/types.ts` para incluir `entra_roles` e `entra_role_members` e remover os `as any` em `PrivilegiadosPage.tsx`.

## Detalhes técnicos

Arquivos afetados:
- `supabase/functions/sync-entra-roles/index.ts` — adicionar chamadas PIM, normalizar `assignment_type`, dedup por (`role_id`, `user_entra_id`, `assignment_type`, `start_at`).
- Nova migração:
  - `alter table entra_role_members add column assignment_type text, start_at timestamptz, end_at timestamptz, directory_scope_id text;`
  - `create table contas_admin_conhecidas (...)` com RLS (admin/operador rw, authenticated read) + GRANTs.
  - `insert into parametros` defaults.
- `src/pages/privilegiados/PrivilegiadosPage.tsx` — coluna Tipo, filtros, header de frescor, modal de contas admin.
- `src/pages/colaboradores/ColaboradorDetalhe*.tsx` — nova seção.

Fora de escopo: integração com fluxo de aprovação para ativar PIM via Lovable (apenas leitura/governança).

## Critérios de aceite
1. Após sync, total de membros = ativos + elegíveis + ativos_pim, com badges visíveis.
2. Alertas "não vinculado" caem para apenas contas humanas reais (excluindo breakglass cadastradas).
3. Header mostra frescor da última sincronização.
4. Ficha do colaborador lista funções privilegiadas atribuídas.
5. `PrivilegiadosPage.tsx` sem `as any` nas queries de `entra_roles*`.
