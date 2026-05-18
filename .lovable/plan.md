# QA Report — Achados em navegação real (sessão atual)

Testei as principais páginas via browser logado como Mathews Cruz. Abaixo os bugs/UX issues encontrados, ordenados por severidade. Marquei o que sugiro corrigir agora e o que precisa de validação adicional.

## 🔴 Críticos (afetam uso ou produção)

### 1. Tour de onboarding reaparece em TODAS as páginas, em TODA sessão
- **Onde:** Dashboard, Colaboradores, Perfis de Acesso, Fila, Solicitações, Aplicações, Revisões, Matriz — sempre que entro, o tour `OnboardingTour` reabre.
- **Esperado:** mostrar uma única vez por usuário (persistir em `localStorage` ou na tabela `profiles` com flag `onboarding_completed`).
- **Impacto:** alto atrito de uso diário.

### 2. Provisionamento falhando com 403 do Microsoft Graph
- **Onde:** `/fila-provisionamento` → detalhe `3b21d396…` (Remoção de Grupo).
- **Erro:** `Authorization_RequestDenied — Insufficient privileges to complete the operation` (status `graph_api_error`, retry 1/10).
- **Causa provável:** o App Registration do Azure não tem permissão `GroupMember.ReadWrite.All` (e/ou consentimento de admin) para remover membros de grupos. Idem para outras ações "Remover Grupo / Remover Licença" pendentes.
- **Ação:** orientação para conceder permissões/consentimento no Entra; eu não consigo corrigir isso via código.

### 3. Bloco "Resultado" de itens com erro usa fundo verde (estilo de sucesso)
- **Onde:** detalhe da fila quando status é `Pendente`/erro de Graph.
- **Esperado:** vermelho/amarelo quando `codigo_erro` não é nulo ou status ≠ `Concluído`. Hoje toda mensagem aparece com `bg-green`.

## 🟠 Importantes (UX/consistência)

### 4. Aba "Cargos" some no diálogo "Editar Perfil"
- **Onde:** `/perfis-acesso/:id` → KPIs mostram "Cargos (1)", "Pessoas (1)", mas o diálogo de edição só tem abas Geral, Aplicações, Licenças, Grupos, SharePoint.
- **Resultado:** usuário não consegue gerenciar vínculo de cargos pelo edit; só visualizar.

### 5. Página de Colaborador mostra Área como código numérico
- **Onde:** detalhe do colaborador "Adamilton…" → campo Área = `30216` (deveria mostrar o nome da área, igual faz com Empresa/Cargo).
- **Causa:** join faltando com `areas` ou exibindo o campo `area_codigo` ao invés de `area_nome`.

### 6. Erros React de DOM nesting em todas as páginas
- **Console:** `<li> cannot appear as a descendant of <li>` no `BreadcrumbSeparator` (`src/components/ui/breadcrumb.tsx`) usado em `AppLayout`.
- **Impacto:** apenas warning hoje, mas indica componente Breadcrumb mal-montado; pode quebrar acessibilidade.

### 7. 404 em recurso de UI
- **Console:** `Failed to load resource: 404` para `src/components/ColaboradorActivityPopover.tsx`. Pode ser cache do Vite; vale validar import quebrado em alguma página.

### 8. Tela de Revisões sem empty state
- **Onde:** `/revisoes` com 0 itens → tabela renderiza header mas área de conteúdo fica em branco, sem mensagem (outras telas têm "Nenhum X cadastrado").

### 9. Página Solicitações com loading lento e tela branca momentânea
- **Onde:** `/solicitacoes` ficou totalmente em branco no primeiro carregamento por ~10s antes de renderizar.
- **Recomendação:** adicionar skeleton/loading state na página enquanto `loading=true`.

## 🟡 Não testado (peço autorização ou ajustes prévios)

Para completar o QA preciso passar por essas áreas; pulei porque envolvem ações destrutivas/integrações reais:

- **Workflow** (criar regra) — só leitura.
- **Revisões** — criar uma campanha de teste (gera emails reais via SendGrid se não for desabilitado).
- **Fila → "Processar Fila Entra ID"** — dispara writes no Entra.
- **Joiner/Mover/Leaver completo** — criar colaborador fake e desativar.
- **Portal externo** (`/portal`) — testar como viewer.
- **Importar Base CSV** — precisa de arquivo de teste.
- **SoD** (criar regra) — só visualização do empty state.
- **Configurações** (Áreas, Cargos, Empresas, Localidades, Parâmetros, Integrações) — não cobertas ainda.
- **Auditoria, Alertas, Privilegiados, Licenças, Exceções** — não cobertas ainda.

## Plano de correção sugerido (após sua aprovação)

Posso fazer numa próxima rodada, agrupado:

**Rodada A — fixes rápidos de frontend (sem risco):**
1. Persistir "onboarding visto" por usuário (item 1).
2. Corrigir cor do bloco Resultado conforme status (item 3).
3. Mostrar nome da Área no detalhe do colaborador (item 5).
4. Corrigir `<li>` aninhado no Breadcrumb (item 6).
5. Empty state em Revisões (item 8).
6. Skeleton em Solicitações (item 9).
7. Investigar 404 do `ColaboradorActivityPopover` (item 7).

**Rodada B — discussão necessária:**
- Item 2 (Graph 403) — você concede a permissão no Entra; do meu lado posso melhorar a mensagem amigável no detalhe da fila.
- Item 4 (aba Cargos no Editar Perfil) — confirmar se cargos devem ser editados pelo perfil ou apenas a partir do cargo.

**Rodada C — QA completo restante:**
- Posso fazer agora se você liberar criação/desativação de registros de teste (com prefixo "QA-") e desabilitar envio de e-mails de teste, ou enquanto isso reporto só os módulos restantes em modo leitura.

## Próximo passo
Me avise:
- (a) **Aprovo Rodada A** para eu já corrigir os 7 fixes de frontend agora; **e/ou**
- (b) **Sigo o QA** pelas áreas não cobertas — em modo leitura ou criando registros "QA-"?
