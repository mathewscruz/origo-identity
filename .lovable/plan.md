## Fila de Aprovação IAM

Adiciona um "gate" entre a geração de ações IAM (por CSV, JML, catálogo, reconciliação etc.) e a execução real no AD/Entra ID. Enquanto o modo estiver ligado, nada é executado sem aprovação manual de um admin.

### Comportamento

- Novo parâmetro global `iam_approval_required` (bool, default **true** no primeiro mês) em `parametros`, editável em Configurações → Parâmetros.
- Quando ligado, todo `INSERT` em `iam_queue` entra com status `waiting_approval` em vez de `pending`.
- O `process-iam-queue` e o `iam-agent-api` só puxam itens com status `pending`. Nada muda no worker — só o gate.
- Ao aprovar: status vira `pending` e a fila roda normalmente.
- Ao recusar: status vira `rejected` com motivo + auditoria.
- Auto-aprovação: se o modo estiver desligado, novos itens já entram como `pending` (comportamento atual).

### Nova tela: `/fila-aprovacao`

Sidebar → "Aprovação IAM" (badge com contagem de pendentes).

Layout:
- **Header**: Toggle grande "Modo Aprovação Obrigatória" (só admin). Chip com "X aguardando aprovação".
- **Filtros**: por `action_type` (create/update/disable/enable/assign_group/…), origem (`importacao_csv`, `reconciliacao`, `catalogo`, `jml`), colaborador (busca), data.
- **Agrupamento**: cards colapsáveis por origem (ex.: "Importação CSV — 3.899 create_if_not_exists"), com resumo e botão "Aprovar tudo do grupo".
- **Tabela** com checkbox: colaborador, action_type, target_identity, resumo do payload (grupos/licenças/dados alterados), origem, criado em.
- **Barra de ações em lote** (aparece com seleção): Aprovar selecionados / Recusar selecionados (modal com motivo obrigatório).
- **Drawer de detalhes**: ao clicar num item, mostra JSON payload formatado, colaborador, histórico de tentativas, e botões individuais.
- **Aba histórico**: itens já aprovados/recusados, com quem aprovou e quando.

### Segurança

- Apenas `admin` pode aprovar/recusar (RLS policy nova).
- `operador` vê a fila mas não age nos botões (readonly).
- Toda decisão vai para `auditoria` (`entidade=iam_queue`, `acao=aprovar|recusar`).

---

## Detalhes técnicos

### Migration
1. `parametros`: seed/upsert `chave='iam_approval_required'`, `valor='true'`, `tipo='boolean'`.
2. `iam_queue`: novas colunas
   - `approval_status text` (não uso do `status` existente para não quebrar workers)
   - `approved_by uuid references auth.users` nullable
   - `approved_at timestamptz` nullable
   - `rejection_reason text` nullable
3. `iam_queue.status`: adicionar valores `waiting_approval` e `rejected` (o campo já é text — só documentação).
4. Trigger `iam_queue_apply_approval_gate` BEFORE INSERT:
   - Se `NEW.status = 'pending'` e parâmetro `iam_approval_required=true` → seta `NEW.status = 'waiting_approval'`.
   - Isso captura **todas** as fontes (`sync-csv-colab`, `reconcile-identities`, `start-jml-event`, catálogo, `process-iam-queue` re-enqueues, etc.) sem alterar cada função.
5. RLS: policy nova "Only admins can approve iam_queue" para UPDATE quando mudando `status` de `waiting_approval` → `pending`/`rejected`.
6. Índice: `idx_iam_queue_waiting_approval (created_at desc) where status='waiting_approval'`.

### Frontend
- **`src/pages/AprovacaoIAMPage.tsx`** — nova página.
- **`src/hooks/useApprovalQueue.ts`** — React Query hooks: `useWaitingApproval()`, `useApprove()`, `useReject()`, `useApprovalMode()` (lê/grava parâmetro).
- **Sidebar**: novo item "Aprovação IAM" com badge de contagem (visível para admin/operador).
- **Rota**: registrar em `App.tsx` protegida por `useCanEdit`.

### Fluxo de aprovação
1. Admin vê itens `waiting_approval`.
2. Aprovar: `UPDATE iam_queue SET status='pending', approved_by=auth.uid(), approved_at=now() WHERE id IN (…)`.
3. O `process-iam-queue`/`iam-agent-api` (que rodam periodicamente ou sob demanda pelo botão existente "Processar fila") pega o item e executa.
4. Recusar: `UPDATE ... SET status='rejected', rejection_reason=?, approved_by=auth.uid(), approved_at=now()`.

### Interação com fluxos existentes
- **CSV sync (3.899 pendentes hoje)**: assim que o modo estiver ligado + trigger criada, o próximo enfileiramento passa pelo gate. Os 3.899 já `pending` **não** são reclassificados retroativamente — a UI oferecerá um botão opcional "Congelar fila atual" que faz `UPDATE iam_queue SET status='waiting_approval' WHERE status='pending'`, útil pra revisar o backlog atual.
- **Reconciliação**: idem.
- **JML manual (start-jml-event)**: passa pelo gate normalmente.
- **Catálogo de autoatendimento**: solicitações que já têm aprovação de gestor + segurança viram itens `iam_queue`; se o gate estiver ligado, precisam de + 1 aprovação técnica do admin IAM. (Configurável no futuro; por ora inclui tudo pra atingir "primeiro mês de gerência".)

### Toggle do modo
- Configurações → Parâmetros ganha um switch destacado "Modo Aprovação Obrigatória (IAM Gate)" com descrição e botão de confirmação. Também replicado no header da própria página de aprovação.

Depois de aprovar você segue direto para implementação, ou quer ajustar algum ponto (ex.: aplicar retroativamente aos 3.899 pendentes, mudar quem aprova, etc.)?
