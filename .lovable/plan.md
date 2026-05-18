# Plano: Rodada C — pendências remanescentes do QA

Consolidação do que ainda falta corrigir/ajustar, dividido por prioridade. Implementarei só os itens que você aprovar.

## 1. Pendências carregadas das rodadas anteriores

| # | Item | Origem | Onde |
|---|------|--------|------|
| 1 | Áreas exibidas como código numérico ("Área 30216") em colaboradores | Dados ruins na tabela `areas.nome` vindos do CSV | Script de cleanup (DB) + ajuste no importador `sync-csv-colab` |
| 2 | Vite serve 404 esporádico para `ColaboradorActivityPopover.tsx` | Cache stale do dev server | Confirmar import path / mover para barrel index |
| 3 | Microsoft Graph 403 nas execuções da fila | Escopos faltantes no App Registration (ação manual no Entra ID) | Apenas documentar: a mensagem humanizada da Rodada B já orienta |
| 4 | "Solicitações" sem skeleton durante fetch (tela branca) | QA anterior | `src/pages/solicitacoes/SolicitacoesPage.tsx` |

## 2. Módulos não cobertos pelo QA (Rodada C estendida)

Vou navegar com o browser nestes módulos, criar registros "QA-" quando necessário e reportar achados antes de corrigir:

- **Workflow** — criação de fluxo, ramificações, aprovações
- **Portal do colaborador** — auto-atendimento, solicitação de acesso
- **JML completo** — Joiner (admissão), Mover (mudança de cargo/área), Leaver (desligamento) end-to-end
- **Privilegiados** — elevação temporária, expiração, auditoria
- **Licenças** — consumo, alertas de saturação, reaproveitamento
- **SoD (Segregação de Funções)** — conflitos detectados, exceções
- **Matriz de acesso** — geração, exportação
- **Revisões** — execução de campanha existente, link externo via token
- **Auditoria** — filtros, exportação, integridade dos logs
- **Alertas / Relatórios** — geração, schedules
- **Integrações / Admin / Configurações** — sanity check

## 3. Melhorias de UX já identificadas (quick wins)

- Loading skeletons consistentes em páginas que ainda usam tela branca durante fetch
- Empty states padronizados (já fiz em Revisões — replicar em Solicitações, Workflow, Alertas)
- Badges de status com cores semânticas consistentes (já fiz em fila — auditar outras telas)
- Tooltip explicando ações destrutivas (revogar, desabilitar)

## 4. Itens técnicos a auditar

- **RLS coverage**: rodar linter Supabase e revisar políticas faltantes
- **Console warnings restantes**: varrer `code--read_console_logs` por warnings ainda não tratados
- **Queries com limit 1000 implícito**: páginas com listas longas (colaboradores 4k+, sites SP 1k+) podem estar truncando silenciosamente — adicionar paginação ou `range()`

## Como prefere prosseguir?

Como o escopo é grande, sugiro escolher um caminho:

- **(A) Quick wins primeiro** — itens 1, 2, 4 da seção 1 + skeletons/empty states da seção 3. ~30 min, baixo risco.
- **(B) QA estendido (seção 2)** — eu navego nos módulos restantes em modo leitura/QA-, listo achados e você aprova correções em lote.
- **(C) Auditoria técnica (seção 4)** — RLS linter, console warnings, paginação. Foco em qualidade/segurança.
- **(D) Tudo na sequência A → B → C** — mais demorado, mas deixa o sistema com QA completo.

Qual rota seguimos?
