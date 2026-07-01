## Diagnóstico

Olhei o banco e a rede do preview.

- O último `sync_jobs.tipo='reconcile_entra'` (`d5e6fb11-…`) está com `status='running'`, parou em 95% na fase `limpando_aprovacao` com a mensagem `2028/2028 avaliados · 2 no Entra · 2026 desligados · 0 mantidos` e **não recebe update há ~19 min**. Ele morreu (timeout do Edge Runtime, sem `try/finally`), mas ninguém marcou como `error`. A tabela `iam_queue` já não tem mais nada em `waiting_approval` — o trabalho real acabou; o que sobrou é só o registro zumbi.
- O frontend (`src/pages/AprovacaoIAMPage.tsx:327`) faz polling a cada 3s enquanto `job.status === 'running'`. Como o job nunca vira `error`, o banner "Reconciliando… 95%" fica **para sempre**, e o botão "Reconciliar contra Entra" fica desabilitado — foi isso que você viu.
- O banner de reconciliação também aparece mesmo com `createIfNotExistsCount = 0` porque a condição inclui `|| reconcileJob` (`AprovacaoIAMPage.tsx:432`), sem se importar se o job é antigo/concluído.
- Existem opções redundantes na tela: "Congelar fila atual" aparece **duas vezes** (banner amarelo em `:409-428` e dentro do card "Modo Aprovação Obrigatória" em `:495-502`); o texto do dialog de reconciliar está longo demais; o subtítulo da página é técnico.

## Correção

### 1. Backend — `supabase/functions/process-iam-queue/index.ts`

- Envolver `runReconcile` em `try/catch/finally`.
  - `catch`: marcar `sync_jobs` como `status='error'`, `phase='falha'`, `error=<mensagem>`, `updated_at=now()`.
  - `finally`: se, ao sair, o registro ainda estiver `running`, promover para `error` com mensagem "Execução interrompida inesperadamente".
- Endurecer o guard de job travado que roda no início da rota `reconcile-create`: se o último `reconcile_entra` estiver `running` e `updated_at` for mais antigo que **3 min**, marcar como `error` e permitir novo start (hoje o corte é 5 min e mais frouxo).
- Emitir `updated_at = now()` a cada batch do cancelamento (a cada 500) durante a fase `limpando_aprovacao`, para o próprio corte de "stale" não disparar em vão.

### 2. Dados — corrigir o job zumbi agora

Fazer um update pontual em `sync_jobs` marcando `d5e6fb11-…` como `status='error'`, `phase='timeout'`, `error='Job interrompido — reconciliação retomada.'`. Assim o banner some imediatamente.

### 3. Frontend — `src/pages/AprovacaoIAMPage.tsx`

- **Detecção de "stale" no cliente:** considerar `reconcileRunning = job.status === 'running' && (now - job.updated_at) < 3 min`. Aplicar em:
  - condição do banner (`:432`),
  - `disabled` do botão (`:469`),
  - `refetchInterval` do polling (`:327`) — para de pollar se `stale`.
- **Estado "travado":** quando `job.status === 'running'` mas `stale`, mostrar mensagem "Última execução parou em X% — clique para rodar novamente" e liberar o botão.
- **Banner só quando fizer sentido:** exibir apenas se `createIfNotExistsCount > 0` ou `reconcileRunning === true`. Se o job apenas terminou (`success`/`error`), sem itens na fila, esconder o banner (mantendo o resumo dentro do dialog quando o usuário abrir).
- **Remover redundância:**
  - Tirar o botão "Congelar fila atual" do card "Modo Aprovação Obrigatória" (`:495-502`). Mantido só no banner amarelo (contexto real de uso: existem `pending` legados).
- **Textos:**
  - Subtítulo curto: "Aprove ou recuse cada ação IAM antes que ela vá para o AD/Entra."
  - Descrição do dialog de reconciliação encurtada (uma frase): "Compara a base com o Entra ID: cancela criações de quem já existe lá e de colaboradores desligados."
  - Toast do disparo: "Reconciliação iniciada — acompanhe o progresso aqui." (remover o parênteses com contagem e o "você pode sair da tela").
- **Barra de progresso mais honesta:** exibir também `phase` em label humano ("Baixando Entra…", "Vinculando colaboradores…", "Limpando fila…") e o timestamp do último update ("atualizado há 4s"). Se `stale`, mostra "sem atualização há Xm".

### 4. Fora de escopo (não farei agora, mas anoto)

- Reindexação/lint de `iam_queue(status, action_type)` — pode ser feita depois se `slow_queries` mostrar dor.
- Job cron que auto-marca reconcile stale — o guard no start da rota já resolve na prática enquanto os disparos forem manuais.

## Resultado esperado

- Banner e botão voltam ao normal imediatamente após o update em `sync_jobs`.
- Uma reconciliação futura que morrer sem terminar vira `error` sozinha e libera nova execução em ≤ 3 min.
- Tela mais limpa: um único ponto de "congelar fila", banner de reconciliação só quando há trabalho a fazer, textos mais curtos e progresso com fase legível.
