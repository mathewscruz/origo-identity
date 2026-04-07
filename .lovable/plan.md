

## Auditoria End-to-End — Problemas Encontrados e Correções

Analisei todos os fluxos, telas, integrações e lógica do sistema. Abaixo os problemas reais encontrados, organizados por criticidade.

---

### PROBLEMAS CRITICOS (fluxo quebrado)

**1. Solicitações aprovadas nao provisionam no Entra ID**
Em `SolicitacoesPage.tsx`, quando uma solicitação é aprovada, cria-se o `perfil_atribuicoes` mas **nao** se gera nenhuma entrada na `iam_queue`. O colaborador recebe a atribuição no sistema mas nao ganha os grupos, licenças ou apps no Entra ID. Precisa chamar `queueFullProfileActions` após a aprovação, igual ao fluxo de `ColaboradorDetalhePage`.

**2. Solicitações nao passam pelo Workflow multi-nivel**
O sistema de workflow (`workflow_etapas`, `workflow_execucoes`) existe como módulo separado, mas as solicitações de acesso simplesmente sao aprovadas/rejeitadas diretamente sem verificar se há etapas de workflow configuradas. O fluxo correto seria: ao criar uma solicitação, verificar se existem `workflow_etapas` para `entidade_tipo = 'solicitacao'` e criar as `workflow_execucoes` correspondentes. Hoje os dois módulos sao independentes.

**3. Exceções aprovadas nao provisionam no Entra ID**
Similar ao item 1: a `ExcecoesPage.tsx` usa `getPerfilResourceIds` e `generateEntraQueueForDiff` apenas para gerar a queue, mas preciso verificar se o colaborador é passado corretamente e se o fluxo está completo (preciso ler mais do arquivo para confirmar, mas a lógica de busca do colaborador pode estar incompleta para terceiros).

---

### PROBLEMAS DE INTEGRACAO

**4. Botao "Editar" no ColaboradorDetalhePage nao faz nada**
O botao `<Button variant="outline" size="sm"><Pencil /> Editar</Button>` na página de detalhe do colaborador nao tem onClick — é puramente visual, nao abre dialog de edição.

**5. Botao "Importar Base" na ColaboradoresPage nao funciona**
O botao existe mas nao tem onClick. Deveria redirecionar para a página de integrações ou abrir o fluxo de importação CSV.

**6. Revisao concluida nao revoga acessos automaticamente**
Quando o owner marca "revogar" em itens de revisão na página externa, a revisão é concluída mas os `perfil_atribuicoes` correspondentes nao sao revogados automaticamente e nao se gera entrada na `iam_queue` para remover no Entra ID.

---

### PROBLEMAS DE CONSISTENCIA

**7. Auditoria ausente em alguns fluxos**
- Atribuição/revogação de perfil a terceiros (TerceiroDetalhePage): sem `logAuditoria`
- Renovação de contrato de terceiro: sem `logAuditoria`
- Criação de regras SoD: auditoria presente, OK
- Sync Entra (licenças, apps, grupos, roles): sem auditoria no frontend ao disparar sync

**8. NotificacoesBell navega para `/configuracoes/alertas` mas referencia rota antiga**
O "Ver todos os alertas" navega para `/configuracoes/alertas` — correto. Mas os alertas com `ref_url` podem apontar para rotas inexistentes dependendo do módulo.

**9. RLS permite anon SELECT em quase todas as tabelas**
Todas as tabelas permitem `anon` fazer SELECT. Isso significa que qualquer pessoa sem autenticação pode ler dados de colaboradores, auditoria, alertas, etc. Isso é um problema de segurança significativo para um sistema IAM.

---

### PLANO DE CORREÇÕES

| # | Ação | Arquivo |
|---|---|---|
| 1 | Adicionar `queueFullProfileActions` na aprovação de solicitações | `SolicitacoesPage.tsx` |
| 2 | Integrar workflow_etapas na criação de solicitações | `SolicitacoesPage.tsx` |
| 3 | Conectar botao "Editar" no detalhe do colaborador | `ColaboradorDetalhePage.tsx` |
| 4 | Conectar botao "Importar Base" (redirecionar para integrações) | `ColaboradoresPage.tsx` |
| 5 | Revogar perfil_atribuicoes quando revisão item marcado "revogar" | `RevisaoExternaPage.tsx` |
| 6 | Adicionar logAuditoria nos fluxos de terceiros | `TerceiroDetalhePage.tsx` |
| 7 | Remover RLS policies de anon SELECT nas tabelas sensíveis | Migration SQL |

### Priorização

Bloco 1 (fluxo quebrado): Itens 1, 2, 5 — provisionamento e revisão
Bloco 2 (UX): Itens 3, 4 — botões sem ação
Bloco 3 (segurança): Item 7 — RLS anon
Bloco 4 (compliance): Item 6 — audit logs

