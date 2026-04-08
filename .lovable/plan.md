

## Plano: Melhorias UX/UI — Itens 2, 4, 5, 6, 7, 8, 10 + Padronizacao visual de dialogs/tabelas

### Escopo

Manter os 7 itens solicitados da avaliacao anterior, mais uma revisao visual de consistencia em dialogs, tabelas, titulos e botoes.

---

### Item 2 — Reorganizar sidebar

- Mover "Workflow" de "Sistema" para "Governanca"
- Renomear grupo "Sistema" para "Administracao"
- Resultado: 5 grupos semanticamente corretos

**Arquivo:** `src/components/AppSidebar.tsx`

---

### Item 4 — Pagina 404 em PT-BR com branding

- Traduzir textos para portugues
- Adicionar logo Origo em grayscale (reutilizar EmptyState)
- Botao estilizado com Button component em vez de link simples

**Arquivo:** `src/pages/NotFound.tsx`

---

### Item 5 — Login com split layout profissional

- Layout dividido: lado esquerdo com gradiente teal/dark, logo grande, tagline "Gestao de Identidades e Acessos"
- Lado direito com o formulario atual
- Responsivo: em mobile, apenas o formulario com logo acima

**Arquivo:** `src/pages/auth/LoginPage.tsx`

---

### Item 6 — Breadcrumb inteligente (sem UUIDs)

- Quando o ultimo segmento do path e um UUID, substituir por "Detalhe" como fallback
- Futuramente, paginas de detalhe podem passar o nome real via context, mas por ora "Detalhe" e suficiente

**Arquivo:** `src/components/AppLayout.tsx`

---

### Item 7 — Configuracoes responsivas

- Em telas < md, trocar o menu lateral por tabs horizontais scrollaveis
- Usar `useIsMobile` hook existente para alternar layout
- Manter menu lateral em desktop

**Arquivo:** `src/pages/configuracoes/ConfiguracoesLayout.tsx`

---

### Item 8 — Indicadores de ordenacao nas tabelas

- Criar componente `SortableHeader` reutilizavel que exibe seta up/down e alterna ordenacao ao clicar
- Aplicar nas colunas principais (Nome, Status, Data) das paginas: Colaboradores, Terceiros, Perfis de Acesso, Solicitacoes, Fila de Provisionamento

**Arquivos:** Criar `src/components/SortableHeader.tsx`, editar as 5 paginas de listagem

---

### Item 10 — Notificacoes com timestamps relativos e agrupamento

- Adicionar timestamps relativos ("ha 5 min", "ha 2h") usando calculo simples (sem lib externa)
- Agrupar alertas por severidade no popover: criticos primeiro, depois avisos, depois info
- Ja tem botao "Ver todos" — manter

**Arquivo:** `src/components/NotificacoesBell.tsx`

---

### Padronizacao visual de Dialogs, Tabelas e Botoes

Apos avaliar os 26 arquivos com dialogs, identifiquei inconsistencias:

**Dialogs:**
- Alguns usam `className="sm:max-w-2xl"` e outros nao tem largura definida — padronizar para `sm:max-w-lg` em formularios simples e `sm:max-w-2xl` em formularios complexos
- Botoes de rodape: alguns tem "Cancelar" + "Salvar", outros so "Criar/Atualizar" sem cancelar — padronizar para sempre ter Cancelar (outline) + Acao primaria
- AlertDialogs de exclusao: padronizar texto para "Esta acao nao pode ser desfeita." em todos

**Tabelas:**
- Headers: padronizar para todos usarem `text-xs uppercase tracking-wider` para consistencia
- Linhas: garantir que todas tenham `cursor-pointer` quando clicaveis (link para detalhe)

**Botoes de acao em listas:**
- Padronizar icones de acao: Pencil para editar, Trash2 para excluir, sempre em variant ghost size icon
- Tooltips nos botoes de acao onde falta

**Paginas afetadas pela padronizacao:** AreasPage, CargosPage, EmpresasPage, LocalidadesPage, ColaboradoresPage, TerceirosPage, PerfisAcessoPage, RevisoesPage, SolicitacoesPage, UsuariosPage

---

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/components/AppSidebar.tsx` — reorganizar grupos |
| Editar | `src/pages/NotFound.tsx` — PT-BR + logo |
| Editar | `src/pages/auth/LoginPage.tsx` — split layout |
| Editar | `src/components/AppLayout.tsx` — breadcrumb sem UUID |
| Editar | `src/pages/configuracoes/ConfiguracoesLayout.tsx` — tabs responsivas |
| Criar | `src/components/SortableHeader.tsx` — header ordenavel reutilizavel |
| Editar | `src/components/NotificacoesBell.tsx` — timestamps + agrupamento |
| Editar | ~10 paginas de listagem — padronizacao de dialogs, headers de tabela, botoes |

