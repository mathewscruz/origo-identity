

## Plano: Aprovacao individual por owner + ajuste de e-mails

### Contexto

Hoje a solicitacao e aprovada/rejeitada como um bloco unico por um admin. O objetivo e que cada item (app, grupo, licenca) seja aprovado individualmente pelo seu owner. Itens sem owner sao aprovados automaticamente.

### Mudancas

**1. Migracao: adicionar owner em `entra_grupos` e `licencas` + criar tabela `solicitacao_itens`**

Nova tabela `solicitacao_itens` para rastrear a decisao individual de cada item:

```sql
CREATE TABLE solicitacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  tipo text NOT NULL,           -- 'app', 'grupo', 'licenca'
  recurso_id uuid NOT NULL,
  recurso_nome text,
  owner_email text,             -- email do owner (null = auto-aprovado)
  status text NOT NULL DEFAULT 'pendente',  -- pendente, aprovado, rejeitado
  decidido_por text,
  decidido_em timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE solicitacao_itens ENABLE ROW LEVEL SECURITY;
-- RLS policies (authenticated select, admin/operador insert/update/delete)

ALTER TABLE entra_grupos ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE licencas ADD COLUMN IF NOT EXISTS owner text;
```

**2. Editar `SolicitacoesPage.tsx` — logica de criacao**

Ao criar solicitacao:
- Inserir na `solicitacao_itens` um registro por item
- Para cada item com owner: status = `pendente`, enviar e-mail `solicitacao_criada` ao owner com detalhes apenas do(s) item(ns) dele
- Para cada item sem owner: status = `aprovado` automaticamente, inserir na `iam_queue` imediatamente
- Status geral da solicitacao: `em_aprovacao` se houver itens pendentes, `aprovada` se todos auto-aprovados

**3. Editar `SolicitacoesPage.tsx` — logica de decisao**

Substituir a aprovacao global por aprovacao por item:
- O dialog de decisao mostra os itens pendentes da solicitacao
- Ao aprovar/rejeitar, atualiza `solicitacao_itens` e provisiona na `iam_queue` os aprovados
- Quando todos os itens forem decididos, atualiza o status geral da solicitacao
- Envia e-mail `solicitacao_decidida` ao solicitante com o resumo de cada item

**4. Editar `PortalSolicitacoesPage.tsx`**

Mesma logica de criacao: inserir itens individuais, notificar owners, auto-aprovar sem owner.

**5. E-mail de boas-vindas**

O codigo atual ja envia o e-mail de boas-vindas para o e-mail do usuario criado (`form.email.trim()`). Validar que o campo `destinatario_email` no payload corresponde ao usuario e nao ao admin.

**6. Ajustar pagina de detalhe de aplicacoes**

Na `AplicacaoDetalhePage`, garantir que o combobox de owner tambem funcione para grupos e licencas (nas respectivas paginas ou detalhe).

### Fluxo

```text
Solicitacao criada
├── Item App-X (owner: joao@...) → pendente → e-mail para joao
├── Item App-Y (sem owner) → aprovado auto → iam_queue
├── Item Grupo-Z (owner: maria@...) → pendente → e-mail para maria
└── Item Licenca-W (sem owner) → aprovado auto → iam_queue

Joao aprova App-X → iam_queue + e-mail ao solicitante
Maria rejeita Grupo-Z → e-mail ao solicitante
→ Status geral: parcialmente aprovada
```

### Arquivos

| Acao | Arquivo |
|---|---|
| Migracao | Criar tabela `solicitacao_itens` + adicionar `owner` em `entra_grupos` e `licencas` |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — criacao com itens individuais + aprovacao por item |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — mesma logica de itens individuais |
| Editar | `src/lib/sendNotificationEmail.ts` — validar tipo `usuario_boas_vindas` no union type |

