

## Plano: Corrigir provisionamento automatico e adicionar logs de acoes Entra ID

### Diagnostico

Investiguei o banco e o codigo. Tres problemas identificados:

**Problema 1 — Entradas faltando na fila**
O perfil "Especialista em Seguranca da Informacao" tem 3 grupos, 1 licenca e 2 apps vinculados. Porem, a `iam_queue` so recebeu 1 grupo e 1 licenca. Os 2 grupos cloud (Visita, Visitas do mes) e 2 apps (Docusign) nunca foram enfileirados.

Causa: a funcao `queueProfileAccess` em `provisionCargoAcessos.ts` nao verifica o resultado dos inserts na `iam_queue`. Se algum insert falha (ex: tipo incompativel, RLS, timeout), ele e silenciosamente ignorado e o loop para. Alem disso, a funcao nao passa `colaborador_id` nos inserts.

**Problema 2 — Grupo on-premises travado em retry infinito**
O unico grupo enfileirado (`TI - INFRA N1 MANAGERS`) e `on_premises_sync = true`. O `process-iam-queue` tenta atribui-lo via Graph API, recebe erro "on-premises mastered", e reenfileira como retry. Deveria marcar como `failed` imediatamente com mensagem clara.

**Problema 3 — Popover de atividades nao mostra acoes Entra ID**
O `ColaboradorActivityPopover` busca `iam_queue` pelo `colaborador_id`, que esta `null` em todos os registros. Alem disso, o popover nao mostra detalhes das acoes executadas (qual grupo, qual licenca, data de execucao pelo Entra ID).

---

### Correcoes

#### 1. Corrigir `provisionCargoAcessos.ts`

- Adicionar `colaborador_id` em todos os inserts da `iam_queue`
- Aceitar `colaboradorId` como parametro em `queueProfileAccess`
- Adicionar tratamento de erro em cada insert (log + continuar)
- Para grupos `on_premises_sync = true`, inserir com status `failed` e mensagem explicativa ao inves de `pending`

#### 2. Corrigir `process-iam-queue` para grupos on-premises

- No handler `assign_group`, quando `payload.onPremisesSync === true`, marcar imediatamente como `failed` com `error_code = "on_premises_managed"` sem retry

#### 3. Atualizar `ColaboradorActivityPopover`

- Buscar `iam_queue` tambem por `target_identity` (sam_account_name do colaborador) como fallback para `colaborador_id`
- Adicionar secao "Acoes Entra ID" com detalhes:
  - Tipo da acao (assign_group, assign_license, assign_app, remove_*)
  - Nome do recurso (grupo, licenca, app) extraido de `payload_json`
  - Status (pendente, sucesso, falhou)
  - Data de execucao (`processed_at`)
- Labels em portugues para cada action_type

#### 4. Reprocessar as entradas faltantes

- Script SQL para resetar a entrada `create_if_not_exists` para `failed` (nao aplicavel sem agente AD)
- Script SQL para marcar o grupo on-premises como `failed`
- Re-gerar as entradas faltantes (2 grupos cloud + 2 apps) manualmente via SQL ou disparar `provisionCargoAcessos` novamente apos a correcao

---

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/lib/provisionCargoAcessos.ts` — adicionar colaborador_id, error handling, skip on-premises |
| Editar | `supabase/functions/process-iam-queue/index.ts` — falhar imediatamente para on-premises groups |
| Editar | `src/components/ColaboradorActivityPopover.tsx` — secao de acoes Entra ID com detalhes |
| Script SQL | Corrigir entradas existentes e re-gerar as faltantes |

### Ordem de implementacao

1. Corrigir `provisionCargoAcessos.ts` (colaborador_id + error handling)
2. Corrigir `process-iam-queue` (on-premises fail-fast)
3. Atualizar `ColaboradorActivityPopover` (logs detalhados)
4. Executar SQL para limpar e re-gerar entradas da fila

