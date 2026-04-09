
Objetivo: corrigir o erro da fila de provisionamento mostrado na tela e alinhar o sistema inteiro aos nomes de status/campos realmente usados hoje.

O que identifiquei
- A fila usa status `pending | processing | success | failed`, mas parte da UI ainda consulta `completed`.
- Há vários fluxos gravando `payload_json` com chaves erradas para grupos e apps:
  - correto no processador: `groupId`, `groupName`, `appId`, `appName`, `appRoleId`
  - hoje existem pontos usando `group_id`, `group_name`, `app_name`, `app_id`, `groupEntraId`, `appEntraId`
- Isso explica erros como o da imagem: itens `assign_app` ficam em retry/falha porque `process-iam-queue` procura `payload.appId` e não encontra.
- Também há telas de aplicação lendo a fila com status/campos antigos, então mesmo quando o provisionamento funciona a exibição pode ficar errada.

Plano de correção

1. Corrigir geração dos payloads da fila
- Editar `src/pages/solicitacoes/SolicitacoesPage.tsx`
  - trocar `group_id/group_name` por `groupId/groupName`
  - trocar `app_name` por `appName`
  - manter `appId` e `skuId`
  - para app, incluir `appRoleId` quando disponível
- Editar `src/pages/portal/PortalSolicitacoesPage.tsx`
  - mesma padronização
- Editar `src/pages/terceiros/TerceiroDetalhePage.tsx`
  - trocar `groupEntraId` por `groupId`
- Editar `src/pages/revisoes/RevisaoExternaPage.tsx`
  - trocar `groupEntraId` por `groupId`
  - trocar `appEntraId` por `appId`

2. Corrigir leitura da fila nas telas
- Editar `src/pages/aplicacoes/AplicacaoDetalhePage.tsx`
  - trocar filtros de `.eq("status", "completed")` para `.eq("status", "success")`
  - trocar leituras antigas `app_name/app_id` para `appName/appId`
  - trocar leituras antigas `group_id/group_name` para `groupId/groupName`

3. Validar consistência visual da fila
- Editar `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` e/ou `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` apenas se necessário para exibir corretamente mensagens/resultados com os status atuais (`success/failed`) e os campos novos.

4. Verificação técnica
- Revisar todos os pontos que inserem `iam_queue` para garantir um padrão único:
  - grupos: `groupId`, `groupName`
  - licenças: `skuId`, `licenseName`
  - apps: `appId`, `appName`, `appRoleId`
- Garantir que os fluxos novos e antigos não fiquem misturados.

Resultado esperado
- Solicitações de app/grupo/licença deixam de falhar por campo ausente no payload.
- A fila mostra progresso correto.
- A tela de aplicações passa a listar corretamente usuários/grupos vindos da `iam_queue`.
- Os itens em retry/falha novos passam a ser processáveis pelo backend.

Arquivos
- `src/pages/solicitacoes/SolicitacoesPage.tsx`
- `src/pages/portal/PortalSolicitacoesPage.tsx`
- `src/pages/terceiros/TerceiroDetalhePage.tsx`
- `src/pages/revisoes/RevisaoExternaPage.tsx`
- `src/pages/aplicacoes/AplicacaoDetalhePage.tsx`
- possivelmente `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx`
- possivelmente `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx`

Observação importante
- Eu não consigo aplicar a correção neste modo somente leitura, mas o problema já está isolado com boa precisão: a causa principal é incompatibilidade de nomes entre o que a UI grava na `iam_queue` e o que `process-iam-queue` consome.
