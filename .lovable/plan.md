## Problema

Ao aprovar um `disable_entra` na tela "Aprovação IAM", o `process-iam-queue` só faz `PATCH accountEnabled=false` no Graph — **não remove grupos, licenças nem aplicativos**. O usuário fica "desabilitado mas ainda licenciado", o que consome licença M365 e mantém pertencimento a grupos sensíveis.

## Causa raiz

A remoção de recursos hoje só acontece via `src/lib/colaboradorLifecycle.ts` (fluxo UI: desativar colaborador pela tela de Colaboradores). Esse arquivo:

1. Desativa `perfil_atribuicoes` (ativo=false)
2. Enfileira `remove_group/remove_license/remove_app` para todos os recursos dos perfis ativos
3. Enfileira `remove_*` para atribuições individuais (`manual_individual`, `entra_sync`) com sucesso

O `reconcile-identities` (que roda no ciclo diário quando detecta desligado no CSV) **não faz esses passos** — só cria o `leaver` event, o `disable_entra` e o `disable` (AD). Então todo desligamento automático deixa o colaborador desabilitado sem revogar acessos. Foi o que aconteceu com o usuário aprovado agora.

## O que vou fazer

### 1. Adicionar revogação de recursos no reconcile-identities

Em `supabase/functions/reconcile-identities/index.ts`, no laço `for (const c of missingLeavers)` (antes/depois de enfileirar `disable_entra`), para cada leaver:

- **Perfis**: buscar `perfil_atribuicoes` ativas do colab, desativar em massa (`ativo=false, data_revogacao=now()`), coletar `perfil_id`s.
- **Recursos dos perfis**: SQL server-side juntando `perfil_grupos`+`entra_grupos`, `perfil_licencas`+`licencas/entra_licencas`, `perfil_aplicacoes`+`aplicacoes` para montar payloads dos `remove_*` com IDs corretos do Entra (deduplicado).
- **Recursos individuais**: buscar itens `iam_queue` do colab com `status='success'`, `action_type IN ('assign_group','assign_license','assign_app')`, `requested_by IN ('manual_individual','entra_sync')`. Enfileirar o `remove_*` correspondente reutilizando `payload_json` (dedup por chave de recurso).
- **Guarda contra duplicatas**: consultar itens abertos (`pending|waiting_approval|processing`) para o par `(colaborador_id, action_type, resource_key)` antes de inserir.
- **Snapshot no leaver event**: gravar `dados_antes.perfis` e `dados_antes.recursos_individuais` (mesmo formato do `colaboradorLifecycle.ts`) para permitir restauração se o colab for reativado.
- **Novos contadores**: `stats.remove_group_enqueued`, `stats.remove_license_enqueued`, `stats.remove_app_enqueued`, `stats.perfis_desativados`.

### 2. Backfill dos casos já desligados

Escopo detectado: **3 colaboradores desligados ainda com perfis ativos** + **2 com atribuições individuais entra_sync/manual_individual sem revogação**. Rodar uma vez a mesma lógica acima retroativamente via `supabase--insert`:

- Desativar `perfil_atribuicoes` desses 3 colabs.
- Enfileirar `remove_group/remove_license/remove_app` para os recursos dos perfis (dedup contra itens abertos).
- Enfileirar `remove_*` para as 2 atribuições individuais.
- Marcar os itens novos com `requested_by='sistema_backfill_leaver'` para rastreabilidade.

### 3. Validar

- Query pós-fix: `desligados_com_perfis_ativos` deve ser 0.
- Query pós-fix: nenhum item `assign_*` com `status='success'` de colab desligado sem `remove_*` correspondente aberto/executado.
- Após rodar o próximo `reconcile-identities`, o job deve exibir os novos contadores populados.

## Fora de escopo

- Fluxo de revogação de SharePoint (o `colaboradorLifecycle.ts` também não faz — é uma limitação existente que segue igual).
- Remoção de app roles diretamente atribuídas fora do Enterprise Apps (permanece como está).
- Notificações por email aos gestores no fluxo automático (o CSV já dispara alertas separados).

## Detalhes técnicos

- Arquivos tocados: `supabase/functions/reconcile-identities/index.ts` (lógica principal + stats).
- Sem migração.
- Backfill via `supabase--insert` — apenas INSERT em `iam_queue` e UPDATE de `perfil_atribuicoes.ativo`; itens sempre auditáveis via `requested_by`.
