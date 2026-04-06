

## Plano: Excluir eventos JML e corrigir o fluxo de provisionamento

### Parte 1 — Excluir todos os eventos JML

Executar SQL para deletar em cascata:
1. `DELETE FROM evento_jml_aprovacoes`
2. `DELETE FROM evento_jml_acoes`
3. `DELETE FROM eventos_jml`

### Parte 2 — Causa raiz do provisionamento que não funciona

Identifiquei **dois problemas distintos**:

#### Problema A: A tela de lista de perfis (PerfisAcessoPage.tsx) não gera nenhuma ação

O dialog "Editar Perfil" que aparece na tela de **lista** de perfis (`PerfisAcessoPage.tsx`, linhas 80-120) faz:
- salva `perfis_acesso`
- sincroniza `perfil_aplicacoes`, `perfil_licencas`, `perfil_grupos`
- exibe toast e fecha

Mas **não calcula diff**, **não busca colaboradores afetados** e **não insere nada na `iam_queue`**. Quando o usuario edita o perfil pela lista, zero ações são geradas.

Apenas a página de **detalhe** do perfil (`PerfilAcessoDetalhePage.tsx`) tem essa lógica.

#### Problema B: As ações que chegam ao Entra ID estão falhando

Os logs da Edge Function mostram:
```
Processing batch of 2 Entra ID queue items (force=true)
[resolveUserId] Found user by email → 2eefb39b-...
Done: 0 success, 0 retries, 2 failures
```

O usuario é encontrado por e-mail, mas a ação falha. Não há log de detalhe do erro. A Edge Function precisa logar a mensagem de erro retornada pela `executeAction` para que seja possível diagnosticar (pode ser permissão insuficiente no grupo, grupo inexistente, etc).

### O que será ajustado

#### 1. Adicionar lógica de provisioning na lista de perfis
**Arquivo:** `src/pages/perfis-acesso/PerfisAcessoPage.tsx`

Ao editar um perfil existente, o `handleSave` passará a:
- capturar o estado anterior (grupo_ids, licenca_ids, aplicacao_ids antigos vs novos)
- calcular diff
- chamar `findAffectedCollaborators(perfilId)` para descobrir todos os colaboradores impactados (direto + via cargo)
- chamar `generateEntraQueueForDiff(colabs, diff)` para gerar assign/remove
- disparar `triggerEntraProcessing()`

Isso alinha o comportamento da lista com o da página de detalhe.

#### 2. Adicionar logging detalhado na Edge Function
**Arquivo:** `supabase/functions/process-iam-queue/index.ts`

Adicionar `console.log` com o resultado da `executeAction` (success/failure + message) para cada item processado, antes de atualizar o status. Isso permitirá diagnosticar exatamente porque os 2 itens estão falhando.

#### 3. Excluir todos os eventos JML
**Script SQL:** DELETE cascata nas 3 tabelas de eventos JML.

### Detalhe técnico

```text
Hoje (lista de perfis):
editar perfil → salvar perfil_grupos/licencas/aplicacoes → fechar dialog
→ zero ações no Entra ID

Depois (lista de perfis):
editar perfil → salvar perfil_grupos/licencas/aplicacoes
→ calcular diff (adicionados vs removidos)
→ buscar afetados (perfil_atribuicoes + cargo_perfis → colaboradores)
→ gerar assign_*/remove_*
→ triggerEntraProcessing()
```

### Arquivos principais

| Ação | Arquivo |
|---|---|
| Adicionar provisioning na edição via lista | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` |
| Adicionar logs detalhados de erro | `supabase/functions/process-iam-queue/index.ts` |
| Excluir eventos JML | Script SQL (3 DELETEs) |

### Ordem de implementação

1. Excluir eventos JML (SQL)
2. Adicionar diff + provisioning em `PerfisAcessoPage.tsx`
3. Adicionar logging detalhado na Edge Function
4. Re-deploy da Edge Function

