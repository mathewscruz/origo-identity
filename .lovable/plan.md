

## Plano: Mover Auditoria/Alertas para Configurações + Validar completude

### 1. Mover Auditoria e Alertas para dentro de Configurações

**Rotas (App.tsx):**
- Remover rotas `/auditoria` e `/alertas` do nível principal
- Adicionar como sub-rotas de `/configuracoes`: `auditoria` e `alertas`
- Adicionar redirects de `/auditoria` → `/configuracoes/auditoria` e `/alertas` → `/configuracoes/alertas`

**Sidebar (AppSidebar.tsx):**
- Remover o grupo "Auditoria" inteiro (com Auditoria e Alertas)
- As entradas passam a existir apenas na navegação lateral de Configurações

**ConfiguracoesLayout.tsx:**
- Adicionar dois itens no `subNav`: Auditoria (icon FileText) e Alertas (icon Bell)

**AuditoriaPage.tsx e AlertasPage.tsx:**
- Remover os headers `<h1>` próprios (título e subtítulo) pois o layout de Configurações já tem header

### 2. Validar que auditoria registra todos os movimentos

**Operações SEM registro de auditoria hoje:**

| Módulo | Operação | Ação faltante |
|---|---|---|
| Colaboradores | Criar/Editar/Excluir/Alterar status | Nenhum audit log |
| Aplicações | Criar/Editar/Excluir | Nenhum audit log |
| Perfis de Acesso | Criar/Editar/Excluir | Nenhum audit log |
| Cargos/Áreas/Empresas/Localidades | CRUD | Nenhum audit log |
| Revisões | Criar campanha | Nenhum audit log |
| Licenças | Criar/Editar/Excluir (externas) | Nenhum audit log |
| Operadores | Criar/Editar | Nenhum audit log |
| Usuários Admin | Criar/Alterar role | Nenhum audit log |

**Correção:** Adicionar `supabase.from("auditoria").insert(...)` após cada operação de escrita nos seguintes arquivos:
- `ColaboradoresPage.tsx` — criar, editar, excluir
- `ColaboradorDetalhePage.tsx` — alterar status (ativar/desativar)
- `AplicacoesPage.tsx` — criar, editar, excluir
- `PerfisAcessoPage.tsx` — criar, editar, excluir
- `PerfilAcessoDetalhePage.tsx` — editar perfil, alterar apps/grupos/licenças
- `CargosPage.tsx`, `AreasPage.tsx`, `EmpresasPage.tsx`, `LocalidadesPage.tsx` — CRUD
- `OperadoresPage.tsx` — CRUD
- `RevisoesPage.tsx` — criar campanha
- `LicencasPage.tsx` — CRUD licenças externas
- `UsuariosPage.tsx` — criar usuário, alterar role

### 3. Validar que Alertas está funcional

**Estado atual:** Alertas só é populado por importações CSV (sync-csv-colab e sync-sharepoint-csv). Faltam alertas para eventos operacionais importantes.

**Alertas a adicionar (no frontend ou edge functions):**
- Exceção aprovada/rejeitada → alerta "info"
- Revisão concluída → alerta "info"
- Colaborador desabilitado → alerta "aviso"
- Falha na fila de provisionamento (item com status `failed`) → alerta "critico"
- Licença Microsoft com uso >90% → alerta "aviso" (no sync-entra-licencas)

**Correção no AlertasPage:** O componente `Badge` está gerando warning de ref (console log). Não afeta funcionalidade mas deve ser corrigido.

### Arquivos a alterar

| Ação | Arquivo |
|---|---|
| Editar | `src/App.tsx` — mover rotas |
| Editar | `src/components/AppSidebar.tsx` — remover grupo Auditoria |
| Editar | `src/pages/configuracoes/ConfiguracoesLayout.tsx` — adicionar sub-nav |
| Editar | `src/pages/auditoria/AuditoriaPage.tsx` — remover header próprio |
| Editar | `src/pages/alertas/AlertasPage.tsx` — remover header próprio |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — audit logs |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — audit logs |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — audit logs |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` — audit logs |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — audit logs |
| Editar | `src/pages/configuracoes/CargosPage.tsx` — audit logs |
| Editar | `src/pages/configuracoes/AreasPage.tsx` — audit logs |
| Editar | `src/pages/configuracoes/EmpresasPage.tsx` — audit logs |
| Editar | `src/pages/configuracoes/LocalidadesPage.tsx` — audit logs |
| Editar | `src/pages/configuracoes/OperadoresPage.tsx` — audit logs |
| Editar | `src/pages/revisoes/RevisoesPage.tsx` — audit logs |
| Editar | `src/pages/licencas/LicencasPage.tsx` — audit logs |
| Editar | `src/pages/admin/UsuariosPage.tsx` — audit logs |
| Editar | `supabase/functions/sync-entra-licencas/index.ts` — alerta licença crítica |
| Editar | `supabase/functions/process-iam-queue/index.ts` — alerta falha provisionamento |

### Ordem de implementação

1. Mover rotas e sidebar (App.tsx, AppSidebar, ConfiguracoesLayout)
2. Ajustar headers das páginas de Auditoria e Alertas
3. Adicionar audit logs em todos os módulos CRUD
4. Adicionar alertas automáticos para eventos operacionais

