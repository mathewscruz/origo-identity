## Diagnóstico

Consultei o banco e o motivo dos 2.028 itens que sobraram ficou muito claro:

- Dos 2.028 `create_if_not_exists` em `waiting_approval`, **praticamente todos (≈2.025) correspondem a colaboradores com `status = 'desligado'`** (só 3 batem com colaboradores `ativo`).
- Ou seja, são pedidos antigos de criação de conta para pessoas que já foram desligadas. No Entra ID esses usuários geralmente não existem mais (foram removidos ou tiveram e-mail/UPN alterados), então a reconciliação por e-mail/UPN/SAM/matrícula/nome não encontra correspondência e o item continua parado — para sempre.
- Além disso os itens estão com `colaborador_id = NULL` no `iam_queue`, o que impede qualquer ligação direta com a tabela `colaboradores`. A reconciliação atual só resolve isso quando o Entra tem o usuário.

Por isso o número não cai para "10 ou pouco mais": não é falha de matching contra o Entra — é lixo histórico de gente já desligada.

## O que vou corrigir

### 1. `supabase/functions/process-iam-queue/index.ts` — bloco `reconcileMode`

- Antes do loop dos itens da fila, montar um **índice de colaboradores por chave** (email, sam, matrícula, prefixo de e-mail, nome normalizado) e um `Map<id, colab>`.
- Para cada item `create_if_not_exists` sem `colaborador_id`, tentar **resolver o colaborador** por essas chaves (mail, upn/prefixo, samAccountName, employeeId, displayName do payload + `target_identity`).
- Regras novas de decisão por item, na ordem:
  1. Se encontrou colaborador e `colab.status = 'desligado'` → **cancelar** com mensagem "Colaborador desligado — criação de conta cancelada." (contador `cancelledDesligado`).
  2. Senão, se bateu no Entra (lógica atual) → cancelar com a mensagem atual (contador `cancelledEntra`) e gravar `entra_id` no colaborador.
  3. Senão → manter (`kept`).
- Aproveitar a resolução para popular `colaborador_id` nos itens que ficaram como órfãos (update em lote), para que futuras execuções não precisem re-resolver.

### 2. Mensagem/telemetria do `sync_jobs`

- Trocar o texto final para algo como:
  `Reconciliação concluída: N colaboradores vinculados · A cancelados (já existem no Entra) · B cancelados (desligados) · C ainda pendentes.`
- Registrar os mesmos números em `auditoria.detalhes`.

### 3. `src/pages/AprovacaoIAMPage.tsx`

- Ajustar apenas o texto do banner/descrição da ação para deixar claro que a reconciliação também limpa criações pendentes de colaboradores já desligados.
- Sem mudanças de lógica no frontend.

## Observações

- Não vou mexer em `sync-csv-colab` neste passo — o script já só enfileira `create_if_not_exists` para joiners novos; o entulho atual é histórico. Se depois quisermos blindagem extra (checar `status != 'desligado'` antes de enfileirar), faço numa próxima rodada.
- Expectativa após executar "Reconciliar contra Entra" novamente: os ~2.028 devem cair para a casa de 0–20 (só sobrarão itens realmente ambíguos, sem match no Entra e sem colaborador `desligado` correspondente).
