
Objetivo: corrigir a desativação para realmente remover grupos/licenças/apps, fazer a sincronização de acessos do EntraID trazer os itens corretos e garantir que a comunicação Cargo → Perfil → Colaborador use uma única regra em todo o sistema.

1. Diagnóstico confirmado
- O vínculo Cargo → Perfil está correto para o caso analisado:
  - cargo `Especialista em Segurança da Informação`
  - perfil `Especialista em Segurança da Informação`
  - perfil contém 1 grupo e 1 licença
- O problema principal está no fluxo de status:
  - `ColaboradorDetalhePage.tsx` já tem lógica nova de hard/soft disable.
  - `ColaboradoresPage.tsx` ainda usa a lógica antiga, que só envia `disable` + `disable_entra`, sem:
    - revogar `perfil_atribuicoes`
    - gerar `remove_group/remove_license/remove_app`
    - salvar snapshot completo
    - tratar reativação com segurança
- Evidência no caso “Teste IAM 7”:
  - usuário está `inativo`
  - ainda existe 1 `perfil_atribuicao` ativa
  - últimos itens da `iam_queue` têm apenas `disable`/`disable_entra`
  - não houve `remove_group` nem `remove_license` no último ciclo
- A sincronização de acessos do EntraID também não alimentou esse colaborador:
  - existem 0 registros `requested_by = 'entra_sync'` para ele
  - no `/colaboradores`, o botão de sincronização em lote ignora usuários `inativo/desligado`
- Há mais uma lacuna funcional:
  - no hard disable atual, a remoção de acessos individuais considera só `manual_individual`
  - acessos importados via `entra_sync` também podem continuar existindo no diretório e não serem revogados

2. Correção proposta
A. Unificar o fluxo de ciclo de vida do colaborador
- Extrair a lógica de:
  - hard disable
  - soft disable
  - reativação
  - snapshot/restauração
  - revogação/provisionamento por cargo
- Colocar tudo em um helper único e reutilizar em:
  - `src/pages/colaboradores/ColaboradorDetalhePage.tsx`
  - `src/pages/colaboradores/ColaboradoresPage.tsx`
- Assim eliminamos a divergência entre “editar no detalhe” e “editar pela lista”.

B. Corrigir a desativação real
No hard disable (`inativo` / `desligado`):
- desativar `perfil_atribuicoes`
- buscar os perfis ativos antes da revogação
- gerar `remove_*` dos recursos vindos dos perfis
- sincronizar/considerar também os acessos individuais efetivos do usuário
- incluir tanto:
  - `manual_individual`
  - `entra_sync`
- deduplicar recursos antes de enfileirar revogações
- salvar snapshot completo no evento JML

C. Corrigir a reativação
- Parar de reativar com fluxo cego na tela de lista
- Na volta para `ativo`:
  - se ainda houver perfis ativos: tratar como soft disable
  - se não houver perfis ativos: reprovisionar pelo cargo
  - restaurar recursos individuais salvos no snapshot do hard disable

D. Corrigir a sincronização do EntraID
- Ajustar a experiência de sincronização para o colaborador analisado:
  - permitir sincronização individual mesmo se o usuário estiver `inativo/desligado`
  - opcionalmente adicionar ação de sync no detalhe do colaborador
- Melhorar a função `sync-user-access` para diagnosticar melhor:
  - quantos grupos/licenças/apps vieram do EntraID
  - quantos casaram com catálogo local
  - quantos ficaram sem correspondência local
- Isso evita “sincronizou mas não trouxe nada” sem explicação visível.

3. Arquivos a ajustar
- `src/pages/colaboradores/ColaboradoresPage.tsx`
  - remover o fluxo legado de disable/enable
  - reutilizar a mesma rotina do detalhe
  - corrigir reativação e sincronização
- `src/pages/colaboradores/ColaboradorDetalhePage.tsx`
  - ampliar snapshot/revogação para incluir `entra_sync`
  - manter a regra hard/soft, agora centralizada
- `src/lib/provisionCargoAcessos.ts`
  - preservar a proteção contra duplicidade
  - alinhar com o fluxo centralizado
- Novo helper compartilhado
  - para encapsular o ciclo de vida do colaborador
- `supabase/functions/sync-user-access/index.ts`
  - melhorar matching/logs/retorno para troubleshooting
  - manter importação de grupos/licenças/apps já existentes no diretório

4. Validação que farei após implementar
- Caso real “Teste IAM 7”
  - sincronizar acessos atuais
  - confirmar importação de grupos/licenças/apps
  - desativar e validar criação de:
    - `disable`
    - `disable_entra`
    - `remove_group`
    - `remove_license`
    - `remove_app` quando existir
  - confirmar `perfil_atribuicoes` inativas
  - reativar e confirmar que não duplica perfis
- Testar os 2 caminhos de UI:
  - alteração pela lista `/colaboradores`
  - alteração pela tela de detalhe
- Validar que Cargo → Perfil → Colaborador continua funcionando sem quebrar provisão aditiva.

5. Remediação do dado atual
Depois da correção:
- executar uma sincronização direcionada para o usuário afetado
- rodar um novo ciclo controlado de desativação/reativação
- confirmar no diretório que os acessos residuais foram removidos
- se restar algum resíduo histórico fora do catálogo, tratar com remoção técnica pontual

Resultado esperado
- desativar realmente remove acessos técnicos
- reativar não duplica perfil
- a sincronização do EntraID passa a preencher os itens do colaborador corretamente
- editar status na lista e no detalhe passa a produzir exatamente o mesmo comportamento
