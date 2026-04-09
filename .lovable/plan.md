

## Plano: Corrigir fluxo de revisoes — colunas faltantes no banco

### Problema critico encontrado

A tabela `revisoes` esta **faltando 4 colunas** que o codigo usa extensivamente:

| Coluna | Usado em |
|---|---|
| `token` (text) | RevisoesPage (gera UUID), RevisaoDetalhePage (link externo), RevisaoExternaPage (busca por token), send-review-email (monta URL) |
| `aplicacao_id` (uuid) | RevisoesPage (insere ao criar campanha) |
| `owner_email` (text) | RevisoesPage (insere ao criar), RevisaoExternaPage (audit), send-review-email (envia e-mail ao owner) |
| `tipo` (text) | RevisoesPage (insere "aplicacao") |

Isso significa que **criar uma campanha falha silenciosamente** (insert com colunas inexistentes), o link externo nunca funciona, e o e-mail de revisao nao consegue encontrar o owner.

### Validacao completa do fluxo

| Etapa | Status | Problema |
|---|---|---|
| Lista de revisoes (`/revisoes`) | UI OK | Insert falha por colunas faltantes |
| Nova campanha (dialog) | UI OK | Insert falha — `token`, `aplicacao_id`, `owner_email`, `tipo` nao existem |
| Detalhe da revisao (`/revisoes/:id`) | UI OK | Link externo nao funciona (sem `token`) |
| Pagina externa (`/revisao-externa/:token`) | UI OK | Query por token falha (coluna inexistente) |
| E-mail ao owner (`send-review-email`) | OK | Depende de `owner_email` e `token` na revisao |
| Auditoria na criacao | OK | `logAuditoria` chamado |
| Auditoria na revisao externa | OK | Insert em `auditoria` com resumo e detalhes |
| Revogacao com iam_queue | OK | Insere remove_group/license/app |
| Auto-recertificacao | Parcial | Cria revisao sem `token`/`owner_email` — e-mail nao pode ser enviado |
| RLS anon (pagina externa) | OK | `anon` tem SELECT e UPDATE em `revisoes` e `revisao_itens` |
| Anon INSERT em `auditoria` | **Falta** | Pagina externa faz insert em `auditoria` como anon mas nao ha policy anon para INSERT |
| Anon INSERT em `iam_queue` | **Falta** | Revogacoes da pagina externa inserem na iam_queue como anon |
| Anon INSERT em `perfil_atribuicoes` update | **Falta** | Pagina externa faz update como anon |

### O que sera feito

**1. Migracao SQL**

Adicionar as 4 colunas faltantes em `revisoes`:
```sql
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS aplicacao_id uuid;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'aplicacao';
```

Adicionar policies anon para as tabelas que a pagina externa precisa escrever:
```sql
-- auditoria: anon INSERT
CREATE POLICY "Anon can insert auditoria" ON auditoria FOR INSERT TO anon WITH CHECK (true);

-- iam_queue: anon INSERT
CREATE POLICY "Anon can insert iam_queue" ON iam_queue FOR INSERT TO anon WITH CHECK (true);

-- perfil_atribuicoes: anon UPDATE
CREATE POLICY "Anon can update perfil_atribuicoes" ON perfil_atribuicoes FOR UPDATE TO anon USING (true);
```

**2. Corrigir auto-recertification**

A edge function `auto-recertification` cria revisoes sem `token` e sem `owner_email`, impedindo o envio de e-mail. Adicionar geracao de token e preenchimento de `owner_email` e `aplicacao_id` ao criar a revisao, e chamar `send-review-email` apos criacao.

**3. Corrigir decisao labels na pagina de detalhe**

Na `RevisaoDetalhePage`, os badges de decisao mostram "manter"/"revogar" em minuscula — padronizar para "Manter"/"Revogar" com primeira letra maiuscula.

### Arquivos

| Acao | Arquivo |
|---|---|
| Migracao | Adicionar colunas `token`, `aplicacao_id`, `owner_email`, `tipo` em `revisoes` + policies anon |
| Editar | `supabase/functions/auto-recertification/index.ts` — incluir `token`, `owner_email`, `aplicacao_id` + enviar e-mail |
| Editar | `src/pages/revisoes/RevisaoDetalhePage.tsx` — capitalizar labels de decisao |

