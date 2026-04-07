

## Plano: Alterar sincronização SharePoint para manual

### O que muda

O card "Sincronização Automática — SharePoint" será alterado para "Sincronização Manual — SharePoint", removendo todas as referências à rotina diária automática e mantendo apenas o botão para puxar dados sob demanda.

### Alterações

**Arquivo:** `src/pages/configuracoes/IntegracoesPage.tsx`

- Trocar o titulo de "Sincronização Automática — SharePoint" para "Sincronização Manual — SharePoint"
- Trocar a descrição para "Busca o CSV mais recente na pasta RH_COLAB do SharePoint sob demanda"
- Remover o badge "Diário" (com icone de Clock)
- Remover a linha "Frequência: Todos os dias às 12:00 UTC (09:00 BRT)"
- Trocar o texto do botão de "Executar Agora" para "Buscar Dados do SharePoint"
- Manter as informações de Site, Pasta e Prefixo como referência

### Resultado

O card ficará limpo, sem menção a agendamento, com um botão claro "Buscar Dados do SharePoint" para o usuario executar manualmente quando quiser.

