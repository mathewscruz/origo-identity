

## Plano: Adicionar toasts de confirmação, alertas e feedback em todo o sistema

### Problema

Vários módulos executam ações sem dar feedback visual ao usuário. Falta confirmação ao sair do sistema, toasts em ações de marcar alertas como lidos, e módulos como Alertas e Matriz não têm nenhum feedback.

### Alterações

**1. Confirmação de logout (`AppSidebar.tsx` e `PortalLayout.tsx`):**
- Adicionar `AlertDialog` de confirmação antes de executar `signOut`
- Texto: "Deseja realmente sair do sistema?"
- Toast de sucesso após logout: "Sessão encerrada"

**2. Alertas (`AlertasPage.tsx`) — sem nenhum toast atualmente:**
- `marcarLido`: toast "Alerta marcado como lido"
- `marcarTodosLidos`: toast "Todos os alertas marcados como lidos"
- Tratar erros com toast destructive

**3. Matriz (`MatrizPage.tsx`) — sem toasts:**
- Verificar se há ações que precisam de feedback (exportação, filtros)

**4. Páginas de detalhe — revisar feedback em ações:**
- `ColaboradorDetalhePage.tsx`: já tem toasts, verificar cobertura completa
- `TerceiroDetalhePage.tsx`: verificar ações sem feedback
- `PerfilAcessoDetalhePage.tsx`: verificar ações sem feedback
- `RevisaoDetalhePage.tsx`: verificar ações sem feedback
- `EventoJMLDetalhePage.tsx`: verificar ações sem feedback
- `SolicitacaoDetalhePage.tsx`: verificar ações sem feedback

**5. Configurações — `AreasPage.tsx` e `LocalidadesPage.tsx`:**
- Verificar se CRUD tem toasts (provavelmente faltam)

**6. Auditoria (`AuditoriaPage.tsx`):**
- Adicionar toast ao exportar dados

**7. Padronização — usar `useToast` consistentemente:**
- Garantir que todos os erros de operações async mostrem toast destructive
- Garantir que todas as ações de salvar/criar/editar/excluir mostrem toast de sucesso

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/components/AppSidebar.tsx` — dialog de confirmação de logout |
| Editar | `src/pages/portal/PortalLayout.tsx` — dialog de confirmação de logout |
| Editar | `src/pages/alertas/AlertasPage.tsx` — toasts em marcar lido/todos lidos |
| Editar | `src/pages/configuracoes/AreasPage.tsx` — toasts CRUD se ausentes |
| Editar | `src/pages/configuracoes/LocalidadesPage.tsx` — toasts CRUD se ausentes |
| Editar | `src/pages/auditoria/AuditoriaPage.tsx` — toast de exportação |
| Editar | `src/pages/revisoes/RevisaoDetalhePage.tsx` — toasts se ausentes |
| Editar | `src/pages/eventos-jml/EventoJMLDetalhePage.tsx` — toasts se ausentes |
| Editar | `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` — toasts se ausentes |

