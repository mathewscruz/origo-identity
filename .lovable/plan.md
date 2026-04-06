
## Plano: usar e-mail como identificador principal no Entra ID e corrigir o processamento imediato

### Diagnóstico confirmado

Há dois problemas distintos no fluxo atual:

1. **O botão “Processar Fila Entra ID” não pega itens em retry**
   - Os itens visíveis estão com `status = pending`, porém com `next_retry_at` no futuro.
   - A função `process-iam-queue` só busca itens cujo `next_retry_at <= now()`.
   - Resultado: o botão responde “Nenhum item pendente na fila”, mesmo existindo itens aguardando nova tentativa.

2. **A resolução do usuário no Entra ID ainda não está confiável pelo e-mail**
   - O código já tenta `mail` antes do `samAccountName`, mas a query atual está montada de forma frágil.
   - Hoje o filtro usa `encodeURIComponent(mail)` dentro do texto do OData filter, o que pode impedir o match correto.
   - Além disso, a função depende do `payload_json`, que pode ficar desatualizado; o ideal é usar o cadastro atual do colaborador como fonte de verdade.

---

## O que será ajustado

### 1. Tornar o e-mail a referência principal para achar o usuário no Entra ID
**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

A função passará a resolver o usuário nesta ordem:

1. Buscar o colaborador pelo `colaborador_id` na base
2. Usar o **e-mail atual do colaborador** como chave principal
3. Tentar no Entra por:
   - `mail`
   - `userPrincipalName`
   - opcionalmente `otherMails`, se necessário
4. Só usar `samAccountName` como fallback para registros legados sem e-mail

Isso garante que o sistema use o identificador mais exato para encontrar o usuário certo no Entra ID.

### 2. Preservar o nome exatamente como está cadastrado
**Arquivos:**
- `supabase/functions/process-iam-queue/index.ts`
- `src/lib/provisionCargoAcessos.ts`
- pontos que inserem `iam_queue` diretamente:
  - `src/pages/colaboradores/ColaboradorDetalhePage.tsx`
  - `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`
  - `src/pages/revisoes/RevisaoExternaPage.tsx`
  - `src/pages/terceiros/TerceiroDetalhePage.tsx`
  - funções de importação em `supabase/functions/sync-csv-colab/index.ts` e `sync-sharepoint-csv/index.ts`

Ajuste:
- usar sempre `colaboradores.nome` como `displayName`
- nunca reconstruir, resumir ou alterar o nome
- para seu caso, deve permanecer exatamente **“Mathews Henrique da Cruz”**

### 3. Fazer o botão processar imediatamente, mesmo com retry agendado
**Arquivos:**
- `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx`
- `src/lib/triggerEntraProcessing.ts`
- `supabase/functions/process-iam-queue/index.ts`

Ajuste:
- o botão enviará um modo **forçado** para a função
- nesse modo, a função ignorará temporariamente o `next_retry_at` e processará todos os itens pendentes do Entra ID naquele clique
- o disparo automático após mudanças também poderá usar esse mesmo modo

Assim, clicar em “Processar fila EntraID” realmente executará na hora.

### 4. Melhorar rastreabilidade do motivo da falha
**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

Quando não encontrar o usuário, a mensagem passará a registrar claramente:
- qual e-mail foi usado
- se o nome veio do cadastro atual
- se houve fallback para `samAccountName`

Isso facilita validar por que uma ação não encontrou o usuário.

---

## Abordagem de implementação

### Etapa 1 — corrigir a resolução do usuário
- Refatorar `resolveUserId`
- Montar a consulta Graph corretamente com parâmetros seguros
- Priorizar o e-mail atual do colaborador

### Etapa 2 — corrigir o processamento imediato
- Adicionar suporte a `force=true` na função
- Ajustar o botão da fila para chamar a função com esse parâmetro
- Ajustar o helper automático para disparo imediato

### Etapa 3 — padronizar nome/e-mail em toda geração de fila
- Revisar todos os pontos que inserem `iam_queue`
- Garantir `displayName = nome exato do colaborador`
- Garantir `mail = email atual do colaborador`

### Etapa 4 — melhorar feedback operacional
- Atualizar `result_message` para deixar explícito o e-mail utilizado
- Facilitar validação quando houver falha de identificação

---

## Resultado esperado

Depois dessa correção:

- ao clicar em **“Processar fila EntraID”**, os itens pendentes serão processados imediatamente;
- o backend usará o **e-mail do usuário como referência principal** para localizar a conta no Entra ID;
- o nome será preservado exatamente como cadastrado, por exemplo:
  - **Mathews Henrique da Cruz**
- as atribuições de grupos, apps e licenças terão chance real de executar sem depender apenas do `samAccountName`.

---

## Detalhes técnicos

```text
Hoje:
fila pendente + next_retry_at futuro
-> botão chama função
-> função ignora item
-> retorno: "Nenhum item pendente"

Depois:
fila pendente + clique no botão
-> botão envia force=true
-> função ignora a janela de retry
-> processa imediatamente
```

```text
Resolução do usuário no Entra ID
1. colaborador_id -> buscar email/nome atuais no banco
2. procurar no Entra pelo email
3. fallback controlado por samAccountName apenas se necessário
4. executar ação no usuário encontrado
```

## Arquivos principais

| Ação | Arquivo |
|---|---|
| Corrigir busca por e-mail no Entra ID | `supabase/functions/process-iam-queue/index.ts` |
| Permitir processamento forçado | `supabase/functions/process-iam-queue/index.ts` |
| Fazer o botão usar processamento imediato | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` |
| Fazer disparo automático usar modo imediato | `src/lib/triggerEntraProcessing.ts` |
| Padronizar nome/e-mail na geração da fila | `src/lib/provisionCargoAcessos.ts` |
| Revisar inserções diretas em `iam_queue` | páginas de colaborador, perfil, revisão, terceiros e funções de importação |
