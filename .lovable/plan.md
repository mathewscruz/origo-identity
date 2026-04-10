
# Analise Completa do Sistema IGA/IAM — Validacao de Fluxos e Achados

## Metodologia
Revisao completa de cada modulo: rotas, hooks, fluxos de provisionamento, edge functions, revisoes, solicitacoes, ciclo de vida JML, SoD, terceiros, perfis, cargos e dashboard.

---

## 1. FLUXOS VALIDADOS (Funcionando corretamente)

### Ciclo de Vida JML (Joiner / Mover / Leaver)
- **Joiner**: Criacao de colaborador gera evento JML `joiner` + provisiona perfis via cargo (`provisionCargoAcessos`). Reativacao restaura perfis e recursos individuais do snapshot salvo no `dados_antes`.
- **Mover**: Mudanca de cargo calcula delta aditivo (apenas adicoes, sem remocoes). Perfis antigos sao desativados logicamente (`perfil_atribuicoes.ativo = false`), novos sao criados.
- **Leaver**: Desativacao revoga todos os perfis, gera `remove_*` para recursos individuais, salva snapshot em `dados_antes` do evento JML, envia `disable` (AD) + `disable_entra` (cloud).

### Motor de Provisionamento (`process-iam-queue`)
- Resolucao de identidade: email > samAccountName (correto).
- Resolucao de Service Principal: 3 estrategias (SP direto > appId filter > Application ID). Robusto.
- Backoff exponencial: 5min * 2^retry. Limite de 10 retries.
- Modo simulacao: corretamente bloqueado quando `modo_operacao = simulacao`.
- Idempotencia: trata `already exists` como sucesso.
- Grupos on-premises: marcados como falha permanente com `error_code: on_premises_managed`.
- `usageLocation`: auto-configurado para `BR` antes de atribuir licencas.

### Agente AD (`iam-agent-api`)
- Separacao clara: consome apenas `create`, `create_if_not_exists`, `update`, `disable`, `delete`.
- Autenticacao via `IAM_AGENT_TOKEN` com Bearer.
- Modo simulacao respeitado.

### Perfis de Acesso
- Edicao calcula diff (added/removed) e dispara `generateEntraQueueForDiff` para colaboradores afetados.
- `findAffectedCollaborators` busca tanto atribuicoes diretas quanto via cargo. Correto.

### Cargos
- Alteracao de cargo dispara `reprovisionCargoCollaborators` com `addedPerfilIds` e `removedPerfilIds`. Politica aditiva respeitada (removedPerfis nao geram `remove_*`).

### Solicitacoes de Acesso
- Fluxo granular por item (`solicitacao_itens`). Owner detectado automaticamente.
- Itens sem owner sao auto-aprovados e provisionados imediatamente.
- Itens com owner aguardam aprovacao e notificam via e-mail.
- Payloads usam IDs externos corretos (`entra_id`, `sku_id`, `default_app_role_id`).

### Revisao de Acessos
- Revisao externa via token funciona. Revogacoes geram `remove_*` na `iam_queue`.
- Revisao interna exibe progresso e estatisticas (mantidos/revogados/pendentes).

### SoD (Segregacao de Funcoes)
- Deteccao de violacoes cruzando `perfil_atribuicoes` ativas com regras de conflito.

### Excecoes
- Excecao `manter_ativo` bloqueia desativacao tanto de colaboradores quanto de terceiros.

---

## 2. PROBLEMAS ENCONTRADOS (Requerem correcao)

### BUG 1: `StatusIcon` no Dashboard nao reconhece `success`
**Arquivo**: `src/pages/Dashboard.tsx`, linha 328
O `StatusIcon` trata `"completed"` como sucesso mas nao `"success"`, que e o status real da `iam_queue`. Resultado: itens concluidos caem no `default` e mostram icone de clock cinza.

**Correcao**: Adicionar `case "success":` na mesma linha que `case "completed"`.

### BUG 2: `TerceiroDetalhePage` usa `generateProfileIamQueue` local em vez de `entraQueueHelper`
**Arquivo**: `src/pages/terceiros/TerceiroDetalhePage.tsx`, linhas 85-119
A funcao local `generateProfileIamQueue` monta payloads manualmente item a item e NAO inclui `colaborador_id` nos registros da fila. Isso causa:
- Payloads sem `colaborador_id` (dificulta rastreabilidade)
- Inconsistencia: usa `samAccountName` como campo no payload mas nao usa `mail` como identidade primaria
- Nao inclui apps do perfil (so grupos e licencas)
- Nao detecta grupos on-premises

O mesmo terceiro usa corretamente `queueFullProfileActions` no fluxo de desligamento (linha 191), mas o `handleAtribuirPerfil` e `handleRevogar` usam a funcao local incorreta.

**Correcao**: Substituir `generateProfileIamQueue` pelo `queueFullProfileActions` do `entraQueueHelper`, passando identidade do terceiro com `email` e `sam_account_name`.

### BUG 3: Revisao Externa (`RevisaoExternaPage`) revoga apenas para `sam_account_name`
**Arquivo**: `src/pages/revisoes/RevisaoExternaPage.tsx`, linhas 128-160
A logica de revogacao na revisao externa so executa iam_queue se `sam` existe. Colaboradores que tem apenas email (sem SAM) nao terao seus acessos revogados no Entra ID. Alem disso, nao inclui `mail` no payload como campo primario.

**Correcao**: Usar `email || sam` como condicao e incluir `mail` no payload. Idealmente, substituir pela funcao `queueFullProfileActions` para consistencia.

### BUG 4: Revisao Externa nao gera `remove_app` para apps sem entra_id
**Arquivo**: `src/pages/revisoes/RevisaoExternaPage.tsx`, linha 152
A condicao `if (a.aplicacoes?.entra_id)` pula apps que nao tem `entra_id`. Isso e correto para o Entra ID, mas deveria gerar alertas ou logs para apps que precisam de revogacao manual.

Impacto: Baixo (comportamento defensivo aceitavel).

---

## 3. OTIMIZACOES SEGURAS IDENTIFICADAS

### OPT 1: Remover hooks legado nao utilizados em `useOrigoData.ts`
Os hooks `useRegras`, `useRegra`, `useRegraCondicoes`, `useRegraResultados` e `usePerfilComposicao` sao no-ops marcados como deprecated. Nenhum componente os importa (ja verificado). Podem ser removidos.

### OPT 2: Tabelas legado no banco de dados
As tabelas `regras`, `regra_condicoes` e `regra_resultados` existem no banco com dados e RLS policies (incluindo acesso `anon` para SELECT). O motor de regras foi removido do codigo. Essas tabelas podem ser:
- Mantidas como historico (sem acao)
- Ou limpas as policies de `anon` SELECT para reduzir superficie de ataque

### OPT 3: Policy `anon INSERT` na `iam_queue` e `auditoria`
A tabela `iam_queue` tem uma policy que permite `anon INSERT` com `true`. Isso e uma superficie de ataque — qualquer pessoa pode inserir registros na fila de provisionamento sem autenticacao. O mesmo ocorre com `auditoria`.

**Recomendacao**: Remover essas policies `anon INSERT` e garantir que edge functions usem `service_role_key` (ja fazem).

### OPT 4: Policy `anon UPDATE` na `perfil_atribuicoes`
A tabela `perfil_atribuicoes` permite `anon UPDATE` com `true`. Vulnerabilidade critica: permite alterar atribuicoes de acesso sem autenticacao.

**Recomendacao**: Remover imediatamente.

---

## 4. RESUMO DAS CORRECOES

| Prioridade | Item | Arquivo | Tipo |
|---|---|---|---|
| Alta | Remover `anon UPDATE` em `perfil_atribuicoes` | Migration SQL | Seguranca |
| Alta | Remover `anon INSERT` em `iam_queue` | Migration SQL | Seguranca |
| Alta | Remover `anon INSERT` em `auditoria` | Migration SQL | Seguranca |
| Alta | Substituir `generateProfileIamQueue` local por `queueFullProfileActions` | `TerceiroDetalhePage.tsx` | Bug funcional |
| Media | Corrigir `StatusIcon` para reconhecer `success` | `Dashboard.tsx` | Bug visual |
| Media | Corrigir revogacao da revisao externa para usar email | `RevisaoExternaPage.tsx` | Bug funcional |
| Baixa | Remover hooks legado | `useOrigoData.ts` | Limpeza |
| Baixa | Remover `anon SELECT` de `regras`, `regra_condicoes`, `regra_resultados` | Migration SQL | Seguranca |

---

## 5. VEREDICTO GERAL

O sistema esta **bem arquitetado** para IGA/IAM. Os fluxos principais (JML, provisionamento, solicitacoes, revisoes, SoD) estao corretos e seguem boas praticas:
- Separacao clara entre AD local e Entra ID cloud
- Politica aditiva para movimentacoes
- Snapshot de acessos para restauracao pos-reativacao
- Deteccao automatica de conflitos SoD
- Workflow de aprovacao por owner com fallback administrativo
- Backoff exponencial com limite de retries
- Modo simulacao para testes

Os problemas encontrados sao pontuais e nao comprometem a arquitetura. As correcoes de seguranca (policies `anon`) sao as mais urgentes.
