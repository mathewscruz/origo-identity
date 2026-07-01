## Plano

1. **Trocar a estratégia da reconciliação**
   - Em vez de verificar cada item de aprovação isoladamente por email/SAM exato, a função vai baixar todos os usuários do Entra ID uma vez, com paginação.
   - Criar índices em memória por email, UPN, SAM, matrícula/employeeId, aliases/proxyAddresses, prefixo do email e nome normalizado.

2. **Comparar a base de colaboradores importada da planilha contra o Entra**
   - Buscar os colaboradores da base interna originados do CSV/SharePoint, especialmente os que estão sem `entra_id`.
   - Para cada colaborador, tentar vínculo por critérios em cascata:
     - email da planilha / email gerado
     - UPN
     - `sam_account_name`
     - matrícula vs `employeeId`
     - prefixo do email
     - nome normalizado, apenas quando o match for seguro

3. **Limpar a fila de aprovação corretamente**
   - Quando um colaborador já existir no Entra:
     - gravar o `entra_id` no colaborador;
     - cancelar os itens `create_if_not_exists` em `waiting_approval`/`pending` ligados a ele;
     - também cancelar itens equivalentes encontrados por identidade/email/SAM, mesmo se `colaborador_id` estiver ausente.
   - O que permanecer em aprovação será apenas o que realmente não foi encontrado no Entra.

4. **Corrigir o ponto que causou os 3 mil itens restantes**
   - A reconciliação atual procura só por `mail`, `userPrincipalName` e `onPremisesSamAccountName` do payload da fila.
   - Como a importação pode gerar email corporativo diferente do identificador existente no Entra, muitos usuários reais não são encontrados.
   - A nova lógica usará a base completa do CSV + múltiplos identificadores do Entra, reduzindo falsos “não encontrado”.

5. **Melhorar rastreabilidade e progresso**
   - Atualizar o job com fases claras: baixando Entra, indexando, vinculando colaboradores, limpando aprovação e concluído.
   - Registrar quantos colaboradores foram vinculados, quantos itens foram cancelados e quantos ficaram pendentes.

## Arquivos a alterar

- `supabase/functions/process-iam-queue/index.ts`
  - Substituir o bloco `reconcile-create` pela reconciliação completa por índice do Entra + base CSV.
- `src/pages/AprovacaoIAMPage.tsx`
  - Ajustar textos da tela para deixar claro que a reconciliação compara a base da planilha/colaboradores contra o Entra ID, não apenas os itens da fila.

## Validação

- Conferir contagem antes/depois da reconciliação:
  - colaboradores CSV sem `entra_id`;
  - itens `create_if_not_exists` em aprovação;
  - itens cancelados pela reconciliação.
- Validar logs da função e o progresso do job em tempo real na tela.