

## Plano: Implementar itens 3 a 10 do roadmap IAM/IGA

Os itens 1 (Dashboard dinâmico) e 2 (Matriz dinâmica) já foram implementados. Segue o plano para os próximos itens, organizados em ordem de prioridade.

---

### Item 3 — Segregation of Duties (SoD) / Conflitos de Acesso

**Objetivo:** Impedir que um colaborador tenha dois perfis conflitantes simultaneamente.

**Migration:**
- Criar tabela `sod_conflitos` com colunas: `id`, `perfil_a_id`, `perfil_b_id`, `descricao`, `severidade` (critico/alto), `ativo`, `created_at`

**Nova página:** `src/pages/sod/SoDPage.tsx`
- Listagem de regras SoD (Perfil A conflita com Perfil B)
- CRUD para criar/editar/excluir conflitos usando comboboxes de perfis reais
- Seção "Violações Atuais" — query que cruza `perfil_atribuicoes` ativas com `sod_conflitos` para detectar colaboradores que violam regras
- Badge com contagem de violações

**Validação automática:**
- No fluxo de exceções (ao aprovar) e no motor de regras (ao executar), verificar conflitos SoD antes de conceder perfil
- Gerar alerta automático quando violação é detectada

**Sidebar e rotas:** Adicionar "SoD / Conflitos" no grupo Governança

---

### Item 4 — Relatórios e Compliance

**Nova página:** `src/pages/relatorios/RelatoriosPage.tsx`
- Relatório "Quem tem acesso a quê" — lista todos colaboradores com seus perfis ativos, agrupados por aplicação
- Relatório "Histórico de concessões/revogações" — query em `perfil_atribuicoes` com filtros de data
- Relatório "Contas órfãs" (preview do item 5)
- Relatório "Acessos excessivos" — colaboradores com mais de N perfis
- Botão "Exportar CSV" para cada relatório

**Sidebar e rotas:** Adicionar "Relatórios" no grupo Controle

---

### Item 5 — Contas Órfãs (Orphan Accounts)

**Integrado ao módulo de Relatórios** como uma aba/seção dedicada.

**Lógica:** Comparar colaboradores com `entra_id` preenchido contra a lista de `colaboradores` ativos. Identificar `entra_id` que não correspondem a nenhum colaborador ativo.

**Ação:** Botão para gerar alerta ou marcar para revisão.

---

### Item 6 — Self-Service / Portal do Colaborador

**Migration:**
- Criar tabela `solicitacoes_acesso`: `id`, `solicitante_id`, `colaborador_id`, `perfil_id`, `justificativa`, `status` (pendente/aprovada/rejeitada), `aprovador`, `data_decisao`, `created_at`

**Nova página:** `src/pages/self-service/SelfServicePage.tsx`
- Colaborador vê seus perfis ativos atuais
- Pode solicitar acesso a um novo perfil (combobox com perfis disponíveis + justificativa)
- Acompanha status das solicitações pendentes

**Painel admin:** Seção na sidebar para gestores aprovarem/rejeitarem solicitações

---

### Item 7 — Workflow de Aprovação Multi-nível

**Migration:**
- Criar tabela `workflow_etapas`: `id`, `entidade_tipo` (excecao/solicitacao), `ordem`, `aprovador_tipo` (gestor/owner/ti), `timeout_horas`
- Criar tabela `workflow_execucoes`: `id`, `entidade_id`, `etapa_id`, `aprovador`, `status`, `data_decisao`, `comentario`

**Lógica:** Quando uma exceção ou solicitação é criada, o sistema gera as etapas do workflow. Cada aprovação avança para a próxima etapa. Timeout gera escalação.

---

### Item 8 — Recertificação Automática

**Lógica:** Criar um parâmetro em `parametros` (ex: `revisao_periodicidade_dias = 90`). Uma Edge Function agendada via pg_cron verifica aplicações que não tiveram revisão nos últimos N dias e cria campanhas automaticamente.

---

### Item 9 — Expiração Automática de Terceiros

**Edge Function agendada:** Verificar terceiros com `contrato_fim < hoje` e `ativo = true`. Para cada um:
- Criar evento JML tipo "leaver"
- Desativar perfil_atribuicoes
- Gerar alerta

---

### Item 10 — Notificações In-App

**Melhorar sidebar:** O ícone de sino mostra badge com contagem de alertas não lidos. Ao clicar, dropdown com os 10 últimos alertas. Clicar em um alerta marca como lido e navega para o ref_url.

---

### Recomendação de implementação por mensagem

Dado o tamanho, recomendo implementar por blocos:

**Bloco A (esta implementação):** Itens 3 + 4 + 5 — SoD, Relatórios e Contas Órfãs
- São os mais impactantes para compliance
- Compartilham lógica (queries em perfil_atribuicoes e colaboradores)

**Bloco B (próxima):** Itens 6 + 7 — Self-Service e Workflow

**Bloco C (depois):** Itens 8 + 9 + 10 — Recertificação, Expiração, Notificações

### Arquivos — Bloco A

| Ação | Arquivo |
|---|---|
| Migration | Criar tabela `sod_conflitos` |
| Criar | `src/pages/sod/SoDPage.tsx` — CRUD de conflitos + detecção de violações |
| Criar | `src/pages/relatorios/RelatoriosPage.tsx` — relatórios com export CSV |
| Editar | `src/App.tsx` — rotas para SoD e Relatórios |
| Editar | `src/components/AppSidebar.tsx` — novos itens no menu |
| Editar | `src/hooks/useOrigoData.ts` — hooks para sod_conflitos |
| Editar | `src/lib/auditLogger.ts` — audit log para SoD |

