# Validação de Prontidão para Produção — Órigo Access & Identity

Antes de dar o "OK" para produção, preciso executar uma rodada estruturada de validação técnica e operacional. Abaixo está o que vou verificar e o que precisa da sua confirmação.

## 1. Status atual (já verificado agora)

- **Build**: passa sem erros.
- **Scanners de segurança** (agent, connector, supabase, supabase_lov): **0 findings**.
- **Linter do banco**: 4 WARN — todas relacionadas a funções `SECURITY DEFINER` executáveis por `anon`/`authenticated`. São as funções usadas pelo portal externo de revisão (`get_revisao_by_token`, `get_revisao_itens_by_token`) e por `has_role`/`has_any_app_role`. Precisam de revisão de `GRANT EXECUTE` para reduzir a superfície (manter apenas o que o fluxo público de revisão exige).

## 2. Validações que vou rodar (read-only) antes do Go

### 2.1 Segurança & RLS
- Conferir RLS habilitada em todas as 46 tabelas `public.*` e ausência de policies permissivas (`USING (true)`) fora de tabelas de catálogo.
- Confirmar que `user_roles` não é gravável pelo próprio usuário (anti escalonamento de privilégio).
- Confirmar que `iam_queue`, `auditoria`, `colab_snapshots` só são escritas por service_role / edge functions.
- Revogar `EXECUTE` desnecessário das 4 funções `SECURITY DEFINER` apontadas pelo linter.

### 2.2 Provisionamento (núcleo IGA)
- Validar o ciclo JML ponta-a-ponta em modo Simulação: Joiner (colab + terceiro), Mover (cargo/área/perfil), Pré-Leaver, Leaver.
- Verificar idempotência da fila (`process-iam-queue`) e tratamento de falhas permanentes (grupos AD via Graph).
- Confirmar que `desligado_manual` impede reativação pelo `sync-csv-colab`.
- Conferir payloads camelCase enviados ao `iam-agent-api` (AD) e ao Graph (Entra).

### 2.3 Sincronizações
- Confirmar que **todos os crons estão desabilitados** (política manual-only) inspecionando `supabase/config.toml` e jobs agendados.
- Validar que cada sync (CSV colaboradores, Entra users/groups/licenças/roles/apps, SharePoint) registra `sync_jobs` com timeout de 10 min e exibe na UI corretamente.

### 2.4 Governança
- SoD: regras carregadas, detecção bloqueando solicitações conflitantes no portal.
- Revisões/Recertificações: criação de campanha, e-mail SendGrid, portal externo por token, gravação em `revisao_itens`.
- Exceções: validade 45 dias para terceiros, "Keep Active" respeitado pelo Leaver.
- PAM: leitura de Directory Roles do Entra.

### 2.5 Operação & UX
- Toaster top-right único, sem scroll horizontal/sidebar, status em PT capitalizado, animações de página.
- Portal de auto-atendimento: carrinho persistente, recomendações por cargo/peers, timeline de aprovação.
- Tour de onboarding dispara para novos admins (localStorage).
- Notification center com severidade e tempo relativo.

### 2.6 Edge Functions
- 20 functions presentes; conferir CORS padrão (`_shared/cors.ts`), validação de JWT em código, uso de Zod nas entradas críticas (`start-jml-event`, `admin-create-user`, `save-external-review`).
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` só é usada server-side e nunca exposta.

### 2.7 Integrações externas
- Azure (CLIENT_ID/SECRET/TENANT): smoke test de token + 1 chamada Graph read.
- SendGrid: smoke test de envio (template Origo).
- IAM Agent on-prem (AD): heartbeat / ping via `iam-agent-api` com `IAM_AGENT_TOKEN`.

### 2.8 Dados & Backup
- Confirmar com você se há snapshot/backup do banco antes do cutover.
- Confirmar limpeza de dados de teste (colaboradores fake, eventos JML de simulação) ou se devem permanecer.

## 3. Itens que dependem de decisão sua (não posso decidir sozinho)

1. **Modo inicial em produção**: começar em **Simulação** por N dias e depois virar para **Produção**, ou já entrar em Produção?
2. **Limpeza de dados de teste**: apagar eventos JML, solicitações e itens de fila criados durante testes? (irreversível)
3. **Domínio publicado**: manter `iam.origoenergia.com.br` como canônico? Redirecionar `origo-identity.lovable.app`?
4. **Lista de admins iniciais** confirmada e com senha temporária `Origo@2026er` para troca no 1º login?
5. **Janela de cutover** e responsável de plantão para o primeiro ciclo CSV/Entra manual.

## 4. Entregáveis após sua aprovação deste plano

- Relatório de validação (PASS/FAIL por item das seções 2.1–2.8).
- Migração SQL corrigindo os 4 WARN do linter (REVOKE EXECUTE público onde aplicável).
- Checklist de cutover assinável (pré-Go, Go, pós-Go 24h/7d).
- Recomendação final: **GO** ou **NO-GO** com motivos.

## Detalhes técnicos

- Linter findings detectados: `0028` (anon) e `0029` (authenticated) em `get_revisao_by_token`, `get_revisao_itens_by_token`, `has_role`, `has_any_app_role`. Para as `has_*`, basta `REVOKE EXECUTE ... FROM anon`; para `get_revisao_*`, manter `anon` (portal por token é o caso de uso intencional) e documentar exceção na security-memory.
- Nenhum finding ativo nos 4 scanners de segurança.
- Build Vite verde; sem TODO/FIXME no código.

Confirma que posso prosseguir com essa bateria de validação (incluindo as respostas às 5 perguntas da seção 3)?
