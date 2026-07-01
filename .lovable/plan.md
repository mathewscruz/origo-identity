## Objetivo

Mudar o sistema de **Simulação** para **Produção**, para que a fila de provisionamento passe a executar de verdade contra AD (via `iam-agent-api`) e Entra ID (via `process-iam-queue`), e orientar a sequência de syncs iniciais (SharePoint + usuários → criação em AD/Entra).

## O que muda tecnicamente

- Atualizar `parametros.valor` para `producao` onde `chave = 'modo_operacao'` (upsert, caso o registro não exista).
- Nada de código muda. Os dois Edge Functions já checam esse parâmetro:
  - `process-iam-queue`: em `simulacao` retorna sem processar; em `producao` executa as ações contra o Microsoft Graph.
  - `iam-agent-api`: em `simulacao` retorna fila vazia para o agente PowerShell; em `producao` entrega os itens pendentes de AD.
- O banner `ModoOperacaoBanner` deixará de aparecer (ou mudará de estado) assim que o parâmetro for atualizado.

## Sequência recomendada depois de ativar Produção

Isso é orientação de uso — nenhum código roda automaticamente (todos os syncs são manuais, conforme política do projeto):

1. **SharePoint** — em Configurações › Integrações, disparar `sync-sharepoint-sites` e depois `sync-sharepoint-csv` (base de colaboradores).
2. **Colaboradores** — validar em Colaboradores que a base foi importada corretamente (nomes, e-mails, cargos).
3. **Entra ID baseline** — rodar `sync-entra-groups`, `sync-entra-licencas`, `sync-entra-apps` e `sync-entra-roles` para trazer o estado atual do tenant.
4. **Provisionamento** — a partir daí, qualquer JML (Joiner/Mover/Leaver) ou atribuição de perfil vai gerar itens em `iam_queue` que serão efetivamente executados em AD e Entra.

## Confirmação necessária

Ativar Produção fará com que **as próximas ações da fila alterem AD e Entra de verdade** (criar contas, atribuir grupos/licenças/apps, resetar senhas, desabilitar usuários no Leaver). Confirma que quer prosseguir agora?

Se sim, ao aprovar este plano eu:
- Executo o upsert em `public.parametros` mudando `modo_operacao` para `producao`.
- Confirmo a mudança lendo o parâmetro de volta.
- Devolvo o checklist acima para você disparar os syncs manualmente na UI.
