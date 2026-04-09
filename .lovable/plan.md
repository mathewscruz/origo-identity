
## Diagnóstico confirmado

- O problema dos grupos está no backend, não na base local. A tabela `entra_grupos` já tem registros suficientes.
- Os logs mostram o erro real: `transitiveMemberOf failed (400), falling back to memberOf`. Ou seja, a consulta atual de grupos no Entra ID está inválida, cai no fallback e por isso continua retornando `0 groups`.
- A duplicação também está confirmada: o `sync-user-access` faz insert cego no `iam_queue` toda vez, e a tela de “Acessos Individuais” lista esse histórico bruto. Por isso apps/licenças reaparecem repetidos a cada sync.

## O que será ajustado

1. **Corrigir a consulta de grupos no Entra ID**
   - Editar `supabase/functions/sync-user-access/index.ts`
   - Substituir a chamada atual de `transitiveMemberOf` por uma consulta compatível com Graph para grupos transitivos.
   - Manter paginação e melhorar logs para mostrar:
     - quantos grupos vieram do Entra ID
     - quantos casaram com `entra_grupos`
     - exemplos de grupos sem match local

2. **Tornar a sincronização idempotente**
   - Ainda em `sync-user-access`, antes de inserir novos itens:
     - buscar os acessos já importados com `requested_by = 'entra_sync'`
     - montar uma chave única por recurso importado
       - grupo: `assign_group + groupId`
       - licença: `assign_license + skuId`
       - app: `assign_app + appId + appRoleId`
     - inserir apenas o que ainda não existe
   - Assim o sync passa a “trazer o que falta” sem duplicar o que já foi importado.

3. **Parar de exibir histórico duplicado como acesso atual**
   - Editar `src/hooks/useOrigoData.ts`
   - Ajustar `useColabIndividualQueue` para retornar o estado atual dos acessos individuais, e não todas as linhas históricas:
     - considerar assign/remove do mesmo recurso
     - manter só o item mais recente por chave
     - exibir apenas o que estiver ativo
   - Isso elimina os duplicados antigos da tela mesmo sem apagar histórico.

4. **Ajustar a tela de detalhe se necessário**
   - Revisar `src/pages/colaboradores/ColaboradorDetalhePage.tsx` apenas se o formato final do hook mudar.
   - A ideia é manter a UX igual, só corrigindo o conteúdo mostrado.

## Resultado esperado

- Os grupos passam a ser importados corretamente.
- Apps, licenças e grupos deixam de duplicar a cada sincronização.
- A seção “Acessos Individuais” mostra apenas os acessos atuais, sem repetir imports antigos.

## Arquivos

- `supabase/functions/sync-user-access/index.ts`
- `src/hooks/useOrigoData.ts`
- `src/pages/colaboradores/ColaboradorDetalhePage.tsx` (se necessário)
