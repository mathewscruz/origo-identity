# Remover aplicações importadas do Azure

Hoje existem 468 aplicações vindas do Azure e 1 cadastrada manualmente. Nenhuma das 468 está ligada a perfis de acesso, licenças ou revisões, então a remoção não afeta acessos de ninguém.

## O que muda
- Apagar as 468 aplicações de origem Azure (com seus perfis internos, conversas e conectores). A aplicação cadastrada manualmente continua.
- Parar de trazer aplicações do Azure: o Hermes deixa de executar a atualização de aplicações e a página Aplicações deixa de pedi-la.
- Página Aplicações: retirar o card "Azure SSO" e o filtro de origem; o aviso de lista vazia passa a convidar a "Conectar sistema".
- Antes de apagar, exportar uma cópia (CSV) das 468 para os seus arquivos.

## Detalhes técnicos
- Backup CSV em /mnt/documents/backups-legados/aplicacoes_azure.csv.
- DELETE em aplicacoes where origem='azure' (filhos: aplicacao_perfis_internos, aplicacao_chat_mensagens, aplicacao_connectors, perfil_apps_internos) via migration; auditoria registrada.
- Remover "sync-entra-apps" do AutoUpdatedHint em AplicacoesPage, da allowlist/SCHEDULE do agente e das tasks de useAutoRefresh; manter "sync-app-profiles" só para apps conectadas.
- Remover memória "Azure Apps Only" (substituída por cadastro próprio).
