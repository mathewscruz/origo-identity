## Diagnóstico

**1. Gate de aprovação está ativo, mas a fila antiga não passou por ele**

- `parametros.iam_approval_required = true` ✅
- Trigger `iam_queue_apply_approval_gate` ativo em `BEFORE INSERT` ✅
- Worker `process-iam-queue` filtra por `status='pending'` — não toca em `waiting_approval` ✅

Porém a fila hoje tem:

| status | itens |
|---|---|
| pending | **3.911** |
| cancelled | 3.881 |
| success | 873 |
| failed | 15 |
| waiting_approval | **0** |

Os 3.911 `pending` foram enfileirados **antes** do trigger existir, então nunca entraram em `waiting_approval` — por isso a tela "Aprovação IAM" está vazia. Se nada for feito, o worker vai executá-los direto assim que o cron/manual disparar, ignorando a nova aprovação.

Composição dos pendentes: 3.899 `create_if_not_exists` (CSV), 4 `assign_group`, 4 `assign_license`, 3 `remove_group`, 1 `remove_license`.

**2. Bloqueio manual (Pré-Desligamento) — funcional, com uma ressalva**

- `src/lib/preLeaver.ts` marca `desligado_manual=true` no colaborador e enfileira `disable_user` (Entra) + `disable_user` (AD) com `status='pending'`.
- Trigger vai capturar e mover para `waiting_approval` automaticamente — comportamento correto pelo escopo escolhido ("Todas as ações IAM").
- `sync-csv-colab` respeita `desligado_manual` e não reativa (memory: manual-disable-csv-guard) ✅.
- **Ressalva:** hoje, com o gate ligado, a suspensão preventiva só bloqueia o usuário *depois* que o admin aprovar na fila. Isso pode ir contra a ideia de "bloqueio imediato" do Pré-Desligamento. Duas opções abaixo.

## Plano

### Passo 1 — Reprocessar a fila antiga (1 clique)

O botão **"Congelar fila atual"** já existe no header da página `/aprovacao-iam`. Ele executa um `UPDATE iam_queue SET status='waiting_approval' WHERE status='pending'` retroativo. Vou:

- Deixar essa ação **destacada** com um alerta no topo da página enquanto houver `pending` legado (banner amarelo com contagem: "3.911 ações foram enfileiradas antes do modo aprovação. Clique para movê-las para aprovação.").
- Ao clicar, mover em lote os 3.911 para `waiting_approval` e registrar em `auditoria` como `queue_freeze_bulk` com o total.
- Depois disso a tela vai listar as 3.911 aprovações agrupadas por `action_type` + origem, prontas pra aprovar/recusar em lote.

### Passo 2 — Definir política do Pré-Desligamento

Precisa decidir (pergunto abaixo se quiser mudar): manter como está (suspensão preventiva também exige aprovação — consistente com "tudo passa pelo gate") **ou** marcar suspensão preventiva como exceção que executa imediatamente (bypass do gate) porque é uma ação de segurança urgente.

### Passo 3 — Validação end-to-end do bloqueio manual

Depois do congelamento, faço um teste rápido:

1. Abrir um colaborador ativo → botão "Suspender Acessos" → confirmar motivo.
2. Verificar que `colaboradores.desligado_manual=true` e que 2 itens (`disable_user` AD + Entra) aparecem em `/aprovacao-iam` como `waiting_approval`.
3. Aprovar → worker processa → Entra desabilita + AD desabilita (via `iam-agent-api`).
4. Rodar `sync-csv-colab` com o colaborador ainda ativo no CSV → confirmar que não reativa (guard funciona).

## Detalhes técnicos

- Nenhuma migração nova é necessária — trigger, colunas e parâmetro já existem.
- Alteração de UI apenas em `src/pages/AprovacaoIAMPage.tsx` para adicionar o banner de "fila legado detectada" quando `count(status='pending') > 0`.
- O botão "Congelar fila atual" já implementado será chamado pelo banner (mesma função).
- Se optar por bypass do Pré-Desligamento no Passo 2, alteração adicional em `src/lib/preLeaver.ts`: inserir com `status='pending'` + `bypass_approval=true` numa flag, e ajustar o trigger para não interceptar quando `action_type IN ('disable_user')` com origem `pre_leaver`. (Só implemento se você pedir.)

## Pergunta antes de executar

O Pré-Desligamento (Suspender Acessos manual) deve:

- **A)** Passar pelo gate como qualquer outra ação (estado atual — consistente, mas admin precisa aprovar antes do bloqueio efetivo).
- **B)** Bypass do gate — executa imediatamente porque é ação de contenção de segurança; a auditoria fica no `desligado_manual_por`.

Responda A ou B e eu já congelo a fila + valido o fluxo.
