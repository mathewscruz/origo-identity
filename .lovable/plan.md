

## Plano: Reformular "Nova Solicitação" com seleção direta de Apps, Grupos e Licenças + workflow de aprovação por owner

### Problema atual

1. A página admin (`SolicitacoesPage`) só permite selecionar um **perfil de acesso** — não permite escolher apps, grupos ou licenças individualmente
2. Não existe coluna `licencas_ids` na tabela `solicitacoes_acesso`
3. A página portal (`PortalSolicitacoesPage`) permite apps e grupos mas não licenças
4. O e-mail de decisão é enviado uma única vez para toda a solicitação, não item a item

### O que será feito

**1. Migração: adicionar coluna `licencas_ids` na tabela `solicitacoes_acesso`**

```sql
ALTER TABLE solicitacoes_acesso ADD COLUMN licencas_ids jsonb;
```

**2. Reformular o dialog "Nova Solicitação" na `SolicitacoesPage`**

Substituir o select de perfil por 3 seções com checkboxes (igual ao portal):
- Aplicações (com busca e scroll)
- Grupos (com busca e scroll)
- Licenças (com busca e scroll) — novo

Manter o select de colaborador. Remover o campo de perfil.

**3. Adicionar licenças ao `PortalSolicitacoesPage`**

Adicionar seção de licenças com checkboxes, busca e scroll (mesmo padrão das apps/grupos já existentes).

**4. Notificação por item ao owner**

Na criação da solicitação (ambas as páginas):
- Para cada app solicitado que tem `owner` definido, enviar e-mail `solicitacao_criada` ao owner
- Apps sem owner: fallback para admins

**5. E-mail individual por item na decisão**

Ao aprovar/rejeitar, além do e-mail geral ao solicitante, enviar e-mail `solicitacao_decidida` detalhando cada item (app/grupo/licença) e se foi aprovado ou rejeitado.

**6. Provisionamento de licenças na aprovação**

No `handleDecision`, além de apps e grupos, inserir itens `assign_license` na `iam_queue` para as licenças solicitadas.

### Arquivos

| Ação | Arquivo |
|---|---|
| Migração | `solicitacoes_acesso` — adicionar coluna `licencas_ids jsonb` |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — reformular dialog com checkboxes de apps/grupos/licenças + notificações por item |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — adicionar licenças + notificações por item |

