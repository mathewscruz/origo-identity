

## Plano: Trocar "Perfil de Acesso" por seleção de Aplicações e Grupos no Portal

### Problema

Atualmente o portal externo permite solicitar apenas um Perfil de Acesso. O usuário precisa poder solicitar Aplicações e/ou Grupos específicos que não fazem parte do seu perfil atual.

### Solução

Substituir o campo "Perfil de Acesso" por dois campos de multi-seleção: **Aplicações** e **Grupos**. O campo `perfil_id` na tabela `solicitacoes_acesso` passará a ser nullable, e serão adicionadas colunas JSON para armazenar os itens solicitados.

### Alterações

**1. Migração de banco:**
- Tornar `perfil_id` nullable em `solicitacoes_acesso`
- Adicionar colunas `aplicacoes_ids` (jsonb, default '[]') e `grupos_ids` (jsonb, default '[]')

**2. `PortalSolicitacoesPage.tsx` — formulário:**
- Remover campo de Perfil de Acesso
- Adicionar campo "Tipo de Solicitação" (Aplicações / Grupos) ou exibir ambos sempre
- Campo **Aplicações**: lista de checkboxes com multi-seleção, carregada de `aplicacoes`
- Campo **Grupos**: lista de checkboxes com multi-seleção, carregada de `entra_grupos`
- Validar que ao menos uma aplicação OU um grupo foi selecionado
- Enviar `aplicacoes_ids` e `grupos_ids` como arrays JSON, `perfil_id` como null

**3. `PortalSolicitacoesPage.tsx` — tabela de histórico:**
- Trocar coluna "Perfil Solicitado" por "Itens Solicitados" mostrando nomes das aplicações/grupos

**4. `SolicitacoesPage.tsx` (admin) — tabela:**
- Adaptar exibição para mostrar aplicações/grupos solicitados quando `perfil_id` for null
- Na decisão de aprovação, se aprovada, enfileirar as ações de `assign_app` e `assign` (grupo) na `iam_queue`

### Arquivos

| Ação | Arquivo |
|---|---|
| Migração | `perfil_id` nullable + colunas `aplicacoes_ids`, `grupos_ids` em `solicitacoes_acesso` |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — multi-seleção de aplicações e grupos |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — exibir e processar solicitações com apps/grupos |

