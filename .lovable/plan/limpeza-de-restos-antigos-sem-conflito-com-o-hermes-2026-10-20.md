# Limpeza de restos antigos (sem conflito com o Hermes)

## O que já está limpo
- Não há nenhuma rotina agendada no banco: zero agendamentos e nenhuma função que chame outras sozinha.
- Nenhum gatilho dispara chamadas externas. O Hermes é o único que executa.
- As funções antigas de processar fila e de trocar senha do Entra não existem mais no código.

## O que sobrou e deve ser removido
1. **Importação manual do RH por upload** (`sync-csv-colab`). A tela de upload foi retirada e nada no painel ou no Hermes usa mais essa função. Hoje a importação passa só pelo SharePoint, então a função sobra e ainda permite gravar a base do RH por fora do fluxo do Hermes. Ação: remover do código e do servidor.
2. **Cópias de segurança de julho/2026** (5 tabelas `backup_*_2026070x`). São cópias pontuais de correções já concluídas e ninguém lê essas tabelas. Ação: exportar um arquivo CSV de cada uma para você guardar e só depois apagar as tabelas. Esta etapa só roda se você confirmar.
3. **Parâmetro `entra_roles_last_sync`**, que guarda a data de junho de uma sincronização manual antiga. Ação: apagar.
4. **Referências em documentos** às funções já removidas (README e docs): trocar por uma nota "removida — substituída pelo Hermes".

## O que fica (ainda tem uso)
- **Funções de sincronização com o Entra, SharePoint, perfis, auditoria, exceções, recertificação e triagem:** o Hermes as chama pela lista de tarefas permitidas.
- **`reconcile-identities`:** fica, por causa da proibição anterior de executá-la. A remoção só acontece se você pedir.
- **`start-jml-event`, `send-notification-email` e `send-review-email`:** usadas pelo assistente e pelos avisos.
- **Backups de mudanças (`iam_change_backups`):** ficam, conforme sua regra.
- **Histórico de migrations antigas:** não se mexe.

## Detalhes técnicos
- Apagar `supabase/functions/sync-csv-colab/` e chamar `delete_edge_functions(["sync-csv-colab"])`. Antes, confirmar com `rg` que nada mais a referencia.
- Exportar os backups com `psql \copy` para `/mnt/documents/backups-legados/`, depois `DROP TABLE` via migration, que pede sua aprovação.
- `DELETE FROM parametros WHERE chave='entra_roles_last_sync'`.
- Atualizar o AGENTS.md: "Base do RH só entra pelo `sync-sharepoint-csv` acionado pelo Hermes".
