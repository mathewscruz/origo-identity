

## Plano: Corrigir animações permanentes na página de Integrações

### Problema

A página de Integrações mostra ícones girando e textos como "Importando..." mesmo quando nenhuma operação está em andamento. Isso acontece porque:

1. **Job "running" preso no banco:** O `useEffect` na linha 39 faz `setCsvSyncing(csvJob?.status === "running")`. Se o último registro em `sync_jobs` ficou com status "running" (job travado/timeout), o botão de CSV fica eternamente com animação.
2. **Painel de progresso exibido para jobs antigos:** A condição `showCsvProgress` mostra o painel para qualquer job com status "done" ou "error", mesmo que seja de dias atrás.

### Solução

1. **Timeout de segurança para jobs "running":** Considerar um job como "stale" se estiver com status "running" há mais de 10 minutos (comparar `updated_at` com `now()`). Nesse caso, não ativar `csvSyncing`.
2. **Limitar exibição do painel de progresso:** Só mostrar o painel `CsvProgressPanel` se o job foi criado/atualizado nas últimas 2 horas.
3. **Resetar estados locais:** Garantir que `spSyncing`, `groupSyncing` e `csvSyncing` são resetados corretamente ao montar o componente (não depender apenas do DB).

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` — adicionar verificação de tempo no `useEffect` do `csvSyncing` e na condição `showCsvProgress` |

