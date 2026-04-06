
## Plano: corrigir o erro de sincronização dos grupos

### Diagnóstico validado

O problema não está mais na lógica de sincronização dos grupos em si.

A função `sync-entra-groups` respondeu com sucesso quando chamada diretamente e retornou:

```text
total: 1712
upserted: 1712
onPremises: 268
cloudOnly: 1444
```

Ou seja: a integração com o Entra ID está funcionando e a função consegue buscar todos os grupos.

### Causa raiz

O erro `Failed to fetch` no navegador é causado por CORS/preflight.

Hoje o frontend envia estes headers ao chamar a função:

```text
apikey
authorization
content-type
```

Mas a função `sync-entra-groups` responde com:

```text
Access-Control-Allow-Headers: authorization, content-type
```

Está faltando permitir `apikey` (e idealmente `x-client-info` também). Com isso, o navegador bloqueia a chamada antes mesmo da função processar a requisição.

---

## O que ajustar

### 1. Corrigir CORS da função `sync-entra-groups`
Arquivo:
- `supabase/functions/sync-entra-groups/index.ts`

Ajustar `corsHeaders` para incluir os mesmos headers aceitos nas outras funções que funcionam no browser, por exemplo:

```text
authorization, x-client-info, apikey, content-type
```

E garantir que:
- o `OPTIONS` continue respondendo com esses headers;
- todas as respostas de sucesso e erro retornem os mesmos headers.

### 2. Padronizar com as outras funções já funcionais
Usar o mesmo padrão de CORS já adotado em:
- `supabase/functions/sync-sharepoint-csv/index.ts`
- `supabase/functions/sync-csv-colab/index.ts`
- `supabase/functions/send-review-email/index.ts`

Assim evitamos divergência entre funções chamadas pela interface.

### 3. Revisar a chamada no frontend
Arquivo:
- `src/pages/configuracoes/IntegracoesPage.tsx`

Manter a chamada atual, mas validar se o tratamento de erro continua correto após o ajuste de CORS. Se necessário, melhorar a mensagem para exibir o erro retornado pela função em vez do genérico `Failed to fetch`.

---

## Resultado esperado após a correção

Ao clicar em `Sincronizar Grupos do Entra ID`:

```text
Frontend -> preflight OPTIONS aprovado
POST executado normalmente
Função busca todos os grupos no Entra ID
Batch upsert grava os grupos na base
Toast mostra totais importados
```

Exemplo esperado no toast:

```text
1712 grupos importados (1444 cloud-only, 268 on-premises)
```

---

## Arquivos envolvidos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-entra-groups/index.ts` |
| Revisar | `src/pages/configuracoes/IntegracoesPage.tsx` |

---

## Observação técnica importante

O teste direto na função já provou que:
- as credenciais Azure estão válidas;
- a paginação está funcionando;
- o batch upsert está funcionando;
- o problema atual é exclusivamente a chamada web bloqueada pelo navegador.

Portanto, esta correção deve destravar o botão sem precisar alterar banco ou a lógica de busca dos grupos.
