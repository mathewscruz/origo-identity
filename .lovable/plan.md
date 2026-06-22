## Objetivo

Validar a integridade do sistema após as recentes mudanças (Pré-Desligamento, guard de reativação por CSV, correções de segurança RLS) — sem alterar nenhum arquivo de produção. Apenas inspeção, execução de checks e relatório.

## Escopo da validação

### 1. Saúde do build e tipos
- `tsc --noEmit` (via build automático) — confirmar que não há erros de tipo após as últimas edições em `colaboradorLifecycle.ts`, `sync-csv-colab/index.ts`, `ColaboradorDetalhePage.tsx`, `preLeaver.ts`.
- Conferir se `src/integrations/supabase/types.ts` já reflete as novas colunas `desligado_manual*` e `suspenso_*` (caso contrário, sinalizar regeneração).

### 2. Saúde do banco
- `supabase--db_health` — uso de disco, conexões, OOM, deadlocks.
- `supabase--linter` — confirmar que os 4 warnings de `SECURITY DEFINER` pré-existentes continuam sendo os únicos itens abertos e que não surgiu nada novo após as últimas migrações.
- `supabase--read_query` — sanity checks:
  - `colaboradores` contém as novas colunas e os defaults estão corretos.
  - `tipo_evento_jml` aceita `pre_leaver` e `pre_leaver_revertido`.
  - Nenhuma linha com estado inconsistente (`desligado_manual=true` + `status=ativo`, ou `suspenso_preventivo=true` sem `suspenso_em`).
  - Nenhum item pendente em `iam_queue` parado há mais de 1h (sinal de loop ou worker travado).

### 3. Saúde das Edge Functions
- `supabase--edge_function_logs` para `sync-csv-colab`, `process-iam-queue`, `iam-agent-api`, `send-notification-email` — última hora; procurar `error`, `failed`, stack traces.
- Confirmar que nenhuma função está em loop de boot/shutdown (sinal de crash).

### 4. Saúde do frontend (runtime)
- `code--read_runtime_errors` e `code--read_console_logs` — pegar qualquer exceção recente em produção.
- `code--read_network_requests` — procurar 4xx/5xx repetidos (especialmente em `colaboradores`, `eventos_jml`, `iam_queue` após as mudanças de RLS).
- Driver Playwright (headless, localhost) para reproduzir o fluxo crítico e capturar screenshots:
  1. `/login` carrega.
  2. Após autenticar (usando a sessão pré-injetada), `/colaboradores` lista sem erro.
  3. Abrir um `ColaboradorDetalhePage` — confirmar que renderiza, sem badge piscando, sem re-render infinito (observar console por warnings de React `Maximum update depth`).
  4. Conferir botões "Suspender Acessos" / "Reverter" presentes e habilitados conforme RBAC.
  5. Navegar para `/alertas`, `/eventos-jml`, `/fila-provisionamento`, `/dashboard` — cada uma sem erro fatal.

### 5. Verificações específicas das features recentes
- **Pré-Desligamento**: SELECT em `colaboradores` por `suspenso_preventivo=true` e cruzar com `eventos_jml` (deve existir um `pre_leaver` correspondente).
- **Guard de CSV**: SELECT em `colaboradores` por `desligado_manual=true`; conferir que nenhum desses tem item recente `enable_*` em `iam_queue`.
- **Findings de segurança fechados**: re-rodar `security--get_scan_results` e confirmar que os 13 IDs corrigidos não reapareceram.

## Critérios de aprovação

- Build limpo, sem erros TS.
- Sem erros 5xx ou exceções no console nos últimos 30 min.
- Nenhum loop de re-render detectado pelo Playwright (logs estáveis após 3s em cada tela).
- `iam_queue` sem pendentes antigos inexplicados.
- Findings de segurança fechados continuam fechados.

## Entregável

Um relatório curto em chat, dividido em ✅/⚠️/❌ por área (build, banco, edge functions, frontend, features novas), com:
- Lista do que foi verificado.
- Qualquer problema encontrado + diagnóstico + sugestão de correção (sem implementar — vai depender de aprovação sua para entrar em build mode).
- Screenshots do Playwright das telas críticas anexados ao relatório.

## Fora do escopo

- Refatoração ou correção de bugs encontrados — apenas reportar.
- Testes de carga ou stress.
- Auditoria de segurança além do que o scanner já cobre.
