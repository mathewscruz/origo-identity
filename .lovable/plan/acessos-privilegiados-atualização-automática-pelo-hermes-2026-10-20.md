# Acessos Privilegiados: atualização automática pelo Hermes

## O que verifiquei
- A página já pede atualização ao Hermes ao ser aberta e mostra "Atualizado há X".
- O Hermes já atendeu: hoje às 15:30 atualizou 92 funções administrativas e 212 atribuições.
- Ainda existe na página um código antigo de "Sincronizar" (sem botão na tela), que chamaria a atualização direto do navegador.

## O que muda
- Retirar o código antigo de sincronização manual, para a página depender só do Hermes, igual às demais.
- Quando o Hermes terminar a atualização, as listas da página (funções, atribuições, data da última atualização) se recarregam sozinhas, sem precisar recarregar a tela.

## Detalhes técnicos
- `PrivilegiadosPage.tsx`: remover `handleSync`, `syncing`, `invokeFunction` e o ícone `RefreshCw` sem uso.
- Ao ver o `agent_tasks` de `sync-entra-roles` passar para `done` (via `useAutoRefresh`/`AutoUpdatedHint`), invalidar `entra-roles`, `entra-role-members-all` e `entra-roles-last-sync`.
