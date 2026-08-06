# Exibir nome do recurso em vez do código (UUID)

## Problema confirmado

Nos itens de "Remoção de Licença" da atividade recente, o payload da fila tem o nome preenchido com o próprio identificador:

```text
licenseName: f30db892-07e9-47e9-837c-80727f46fd3d
skuId:       f30db892-07e9-47e9-837c-80727f46fd3d
```

Consultando o catálogo, esse SKU tem nome real cadastrado (`FLOW_FREE` / "Microsoft Power Automate Free"); o mesmo vale para os outros três da tela (Power BI Free, Dynamics 365 Sales Professional Trial, Microsoft Teams). Ou seja, o catálogo está correto — o que ficou ruim é o texto gravado no payload desses itens, e a UI apenas repete o payload sem tentar resolver o nome.

## O que fazer

### 1. Resolver o nome na exibição (correção principal)

Criar um resolvedor único de nome de recurso no frontend que, dado um item da fila:

- usa `licenseName` / `groupName` / `appName` / `siteName` quando o valor é um nome de verdade;
- ignora o valor quando ele é apenas um UUID (ou igual ao próprio id do recurso) e busca o nome no catálogo local por `skuId` (licenças), `groupId` (grupos) e `appId` (aplicações);
- para licenças, prefere o nome amigável ("Microsoft Power Automate Free") e cai para o código do SKU quando não houver;
- só mostra o UUID como último recurso, e nesse caso abreviado e com o nome técnico indicado.

Aplicar esse resolvedor nas telas que hoje imprimem o payload cru:

- Dashboard — atividade recente (tela do print)
- Aprovação IAM — coluna de divergência/detalhe
- Detalhe do colaborador — Acessos Individuais
- Detalhe do evento JML
- Popover de atividade do colaborador
- Detalhe do item da fila de provisionamento

### 2. Corrigir a origem para novos itens

Nos pontos que geram itens de licença/grupo/app, gravar sempre o nome do catálogo e nunca o id como nome. Onde o recurso não existir no catálogo local, gravar o nome como vazio (em vez do id), para a UI resolver depois quando o catálogo sincronizar.

### 3. Normalizar os itens já existentes

Atualizar os itens da fila cujo nome gravado é igual ao id, substituindo pelo nome do catálogo (licenças, grupos e aplicações). Itens sem correspondência no catálogo ficam com nome vazio e passam a ser resolvidos/rotulados pela UI.

## Detalhes técnicos

- Novo módulo `src/lib/resourceNames.ts` com `isUuid()` e `resolveResourceLabel(item, catalogs)`; catálogos vindos dos hooks já existentes de licenças/grupos/aplicações (`useOrigoData`), com cache do React Query — sem consulta extra por linha.
- Ajuste dos produtores: `reconcile-identities`, `sync-user-access`, `sync-csv-colab`, `sync-sharepoint-csv`, `expire-access-exceptions`, `save-external-review`, `entraQueueHelper.ts`.
- Backfill via migration idempotente em `iam_queue.payload_json` usando join por `skuId`/`groupId`/`appId`.
- Nenhum item da fila será aprovado, executado ou cancelado.
