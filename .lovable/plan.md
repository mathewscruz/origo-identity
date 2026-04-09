
Problema identificado: o erro acontece porque a fila de provisionamento processa ações de app esperando `payload_json.appId`, mas parte dos fluxos de solicitação ainda monta itens sem trazer o `entra_id` da aplicação/grupo/licença. Na prática, alguns registros acabam indo para a `iam_queue` com ID interno, incompleto, ou sem o campo externo correto, e o processador devolve `appId ausente no payload`, exatamente como aparece na fila.

O que corrigir

1. Ajustar a origem dos dados nas telas de solicitação
- `src/pages/solicitacoes/SolicitacoesPage.tsx`
- `src/pages/portal/PortalSolicitacoesPage.tsx`

Essas telas precisam buscar também os identificadores externos usados no provisionamento:
- aplicações: `entra_id`, `default_app_role_id`
- grupos: `entra_id`
- licenças: `sku_id`

2. Padronizar o payload enviado para a `iam_queue`
- Garantir que apps usem sempre:
  - `appId`
  - `appName`
  - `appRoleId`
- Garantir que grupos usem:
  - `groupId`
  - `groupName`
- Garantir que licenças usem:
  - `skuId`
  - `licenseName`

3. Corrigir o autoaprovado das solicitações
Hoje o fluxo autoaprovado depende de dados carregados na tela. Como o portal/admin não trazem todos os campos externos, ele consegue criar a solicitação, mas gera item quebrado para provisionamento.
- Atualizar a lógica de `provisionItem` e do `queueItems.map(...)` para sempre resolver o ID externo a partir dos dados completos carregados.
- Para app, incluir também `appRoleId` quando existir.

4. Reforçar a leitura nas telas relacionadas
- Revisar `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` para manter leitura consistente de `appId/appName/groupId/groupName`.
- Revisar `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` e `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` apenas para exibir melhor o erro, se necessário, sem mudar a regra do backend.

5. Validar o comportamento esperado após correção
Depois da implementação, os novos itens deverão:
- sair da solicitação com payload correto
- parar de cair em retry por falta de `appId`
- ser processados normalmente pelo fluxo de apps/grupos/licenças

Causa raiz resumida
- O processador está correto: ele exige `appId`.
- O problema está principalmente nas páginas de solicitação, que ainda não carregam todos os campos externos necessários para montar o payload completo.
- Por isso o item é criado, mas falha depois no processamento.

Arquivos envolvidos
- `src/pages/solicitacoes/SolicitacoesPage.tsx`
- `src/pages/portal/PortalSolicitacoesPage.tsx`
- `src/pages/aplicacoes/AplicacaoDetalhePage.tsx`
- possivelmente `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx`
- possivelmente `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx`

Observação importante
Também vale revisar os itens já quebrados na fila: corrigir o código evita novos erros, mas os registros antigos que já ficaram com payload inválido continuarão falhando até serem recriados ou ajustados no backend.
