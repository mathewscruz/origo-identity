

## Plano: Evolucao completa do IGA - 4 modulos + modo producao

Este plano abrange as 4 demandas principais e uma analise de gaps para completar o sistema como IGA/IAM funcional.

---

### Modulo 1: Validacao de usuarios importados contra o AD

**Problema**: A importacao diaria (sync-csv-colab) cria colaboradores no sistema mas nao verifica se ja existem no AD.

**Solucao**: Apos cada importacao, gerar automaticamente solicitacoes `create` na `iam_queue` apenas para colaboradores novos. O agente PowerShell externo faz a validacao real no AD (verificar se o samAccountName existe, se nao existir criar).

**Alteracoes**:

1. **Adicionar campo `sam_account_name` na tabela `colaboradores`** — migracao SQL para persistir o login AD.
2. **Alterar `sync-csv-colab`** — ao detectar um novo colaborador (joiner), gerar automaticamente uma entrada na `iam_queue` com `action_type = "create_if_not_exists"` (novo tipo). O payload segue o mesmo padrao ja definido.
3. **Atualizar `iam-agent-api`** — adicionar o novo action_type `create_if_not_exists` na documentacao do endpoint. O agente PowerShell decide: se o usuario ja existe no AD, atualiza o status para `completed` com `result_message = "already_exists"`; se nao existe, cria e retorna `completed`.
4. **Logica de samAccountName para importados** — gerar automaticamente o samAccountName a partir do CSV: usar o campo `mail` (parte antes do @) ou `employID` como fallback. Gravar em `colaboradores.sam_account_name`.

| Acao | Arquivo |
|---|---|
| Migracao | Adicionar coluna `sam_account_name` em `colaboradores` |
| Editar | `supabase/functions/sync-csv-colab/index.ts` |
| Editar | `supabase/functions/iam-agent-api/index.ts` (documentar novo tipo) |

---

### Modulo 2: Reintegrar Entra ID para provisionamento de perfis de acesso

**Problema**: O Entra ID foi removido para criacao de usuarios, mas ainda e necessario para atribuir apps, grupos e licencas.

**Solucao**: Criar uma Edge Function `entra-provision-access` que, quando um perfil de acesso e atribuido a um colaborador, gera solicitacoes na `iam_queue` para o agente sincronizar grupos/apps no Entra ID (apos o usuario ter sido replicado do AD local para o Entra ID pelo script automatico existente).

**Alteracoes**:

1. **Novo action_type na `iam_queue`**: `assign_group`, `remove_group`, `assign_license`, `remove_license` — o agente PowerShell usa o Microsoft Graph API para executar.
2. **Alterar `provisionCargoAcessos.ts`** — apos criar/revogar `perfil_atribuicoes`, consultar a composicao do perfil (grupos, licencas, apps via `perfil_grupos`, `perfil_licencas`, `perfil_aplicacoes`) e gerar entradas na `iam_queue` para cada grupo/licenca.
3. **Payload padrao para grupo**: `{ samAccountName, groupId (entra_id do grupo), groupName, action: "add"|"remove" }`
4. **Payload padrao para licenca**: `{ samAccountName, skuId, licenseName, action: "add"|"remove" }`

| Acao | Arquivo |
|---|---|
| Editar | `src/lib/provisionCargoAcessos.ts` |
| Editar | `supabase/functions/iam-agent-api/index.ts` (documentar novos tipos) |

---

### Modulo 3: Terceiros com perfis de acesso

**Problema**: Terceiros nao tem atribuicao de perfis de acesso como colaboradores.

**Solucao**: Reaproveitar a infraestrutura de `perfil_atribuicoes` (que ja tem `terceiro_id`) e criar interface no detalhe do terceiro.

**Alteracoes**:

1. **Adicionar campo `sam_account_name` na tabela `terceiros`** — migracao SQL.
2. **Editar `TerceiroDetalhePage.tsx`** — adicionar aba "Perfis de Acesso" com:
   - Lista de perfis atribuidos (via `perfil_atribuicoes` onde `terceiro_id = id`)
   - Botao "Atribuir Perfil" — dialog com select de perfis, cria `perfil_atribuicoes` e gera entradas na `iam_queue` (mesma logica de grupos/licencas do Modulo 2)
   - Botao "Revogar" em cada perfil
3. **Editar `TerceirosPage.tsx`** — adicionar campo `sam_account_name` no formulario de criacao. Ao criar, gerar `iam_queue` com `action_type = "create"` (mesmo padrao de colaboradores).
4. **Editar `useOrigoData.ts`** — adicionar hook `useTerceiroAtribuicoes(terceiroId)`.

| Acao | Arquivo |
|---|---|
| Migracao | Adicionar coluna `sam_account_name` em `terceiros` |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` |
| Editar | `src/hooks/useOrigoData.ts` |

---

### Modulo 4: Revisao de acesso funcional com fluxo de e-mail

**Problema**: O modulo de revisoes e basico — nao gera campanhas automaticas por aplicacao, nao envia e-mail ao owner e nao executa acoes.

**Solucao**: Reconstruir o fluxo completo de revisao de acesso.

**Alteracoes**:

1. **Migracao SQL** — adicionar campos na tabela `revisoes`:
   - `aplicacao_id uuid` (FK para aplicacoes — a revisao e por app)
   - `owner_email text` (copiado da aplicacao no momento da criacao)
   - `token text` (token unico para acesso externo sem login)
   - `tipo text default 'aplicacao'`

2. **Nova pagina publica `RevisaoExternaPage.tsx`** — acessada via `/revisao-externa/:token` (rota publica, sem ProtectedRoute). Mostra:
   - Nome da aplicacao
   - Lista de colaboradores/terceiros com acesso ativo
   - Para cada pessoa: botao "Manter" / "Revogar"
   - Botao "Salvar Revisao" que atualiza `revisao_itens` e gera `iam_queue` para cada revogacao

3. **Edge Function `send-review-email`** — envia e-mail ao owner usando Lovable AI (ou Resend se conectado) com link para a pagina de revisao externa.

4. **Alterar `RevisoesPage.tsx`** — botao "Nova Campanha" abre dialog que permite:
   - Selecionar aplicacao
   - O sistema busca automaticamente o owner da aplicacao
   - Gera `revisao_itens` com todos os colaboradores/terceiros que tem perfis vinculados aquela aplicacao
   - Envia o e-mail ao owner

5. **Alterar `RevisaoDetalhePage.tsx`** — mostrar resultado consolidado (quem manteve, quem revogou, quem decidiu, quando).

6. **Registro de auditoria** — ao salvar, gravar em `auditoria` com todos os detalhes.

| Acao | Arquivo |
|---|---|
| Migracao | Alterar tabela `revisoes`, adicionar campos |
| Criar | `src/pages/revisoes/RevisaoExternaPage.tsx` |
| Criar | `supabase/functions/send-review-email/index.ts` |
| Editar | `src/pages/revisoes/RevisoesPage.tsx` |
| Editar | `src/pages/revisoes/RevisaoDetalhePage.tsx` |
| Editar | `src/App.tsx` (rota publica) |

---

### Modulo 5: Modo Producao vs Simulacao

**Solucao**: Criar um parametro global `modo_operacao` na tabela `parametros` com valores `simulacao` ou `producao`.

**Alteracoes**:

1. **Inserir parametro** `modo_operacao = "simulacao"` na tabela `parametros`.
2. **Criar componente `ModoOperacaoBanner.tsx`** — banner fixo no topo quando em modo simulacao ("Modo Simulacao — as acoes nao serao executadas no AD").
3. **Alterar `iam-agent-api` GET /pending** — quando `modo_operacao = "simulacao"`, retornar array vazio (o agente nao recebe nada para processar).
4. **Alterar `ParametrosPage.tsx`** — adicionar card "Modo de Operacao" com toggle Simulacao/Producao e confirmacao de seguranca (AlertDialog).
5. **Alterar `AppLayout.tsx`** — exibir o banner quando em modo simulacao.
6. **Hook `useModoOperacao()`** — consulta o parametro e retorna o modo atual.

| Acao | Arquivo |
|---|---|
| Migracao | Inserir parametro `modo_operacao` |
| Criar | `src/components/ModoOperacaoBanner.tsx` |
| Criar | `src/hooks/useModoOperacao.ts` |
| Editar | `supabase/functions/iam-agent-api/index.ts` |
| Editar | `src/pages/configuracoes/ParametrosPage.tsx` |
| Editar | `src/components/AppLayout.tsx` |

---

### Analise de Gaps — O que falta para ser um IGA completo

| Gap | Descricao | Prioridade |
|---|---|---|
| **Segregacao de funcoes (SoD)** | Regras que impedem combinacoes perigosas de perfis (ex: quem aprova nao pode executar). Tabela `sod_rules` com pares de perfis conflitantes. | Alta |
| **Relatorios e dashboards** | Dashboard com metricas: total de acessos, acessos nao revisados, licencas ociosas, SLAs de provisionamento. Exportacao CSV/PDF. | Media |
| **Workflow de aprovacao** | Fluxo formal de aprovacao para excecoes e atribuicoes manuais com multi-nivel (gestor -> owner -> seguranca). | Alta |
| **Self-service** | Portal para colaboradores solicitarem acesso a apps/perfis com justificativa e aprovacao automatica. | Baixa |
| **Conectores de reconciliacao** | Comparar acessos reais no Entra ID/AD com o que o sistema espera. Detectar acessos nao autorizados. | Alta |
| **Politica de senhas e MFA** | Registrar e monitorar politicas de senha e MFA por aplicacao. | Baixa |
| **Lifecycle de contas de servico** | Gerenciar contas de servico (nao-humanas) com rotacao de credenciais. | Baixa |

Os 3 primeiros (SoD, Relatorios, Workflow) sao os mais criticos para compliance e auditoria.

---

### Ordem de implementacao sugerida

1. Modulo 5 (Modo Producao) — rapido e necessario antes de tudo
2. Modulo 1 (Validacao AD na importacao)
3. Modulo 3 (Terceiros com perfis)
4. Modulo 2 (Entra ID para perfis)
5. Modulo 4 (Revisao de acesso)

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Migracao | `sam_account_name` em `colaboradores` e `terceiros`; campos em `revisoes`; parametro `modo_operacao` |
| Criar | `RevisaoExternaPage.tsx`, `send-review-email/index.ts`, `ModoOperacaoBanner.tsx`, `useModoOperacao.ts` |
| Editar | `sync-csv-colab/index.ts`, `iam-agent-api/index.ts`, `provisionCargoAcessos.ts`, `TerceiroDetalhePage.tsx`, `TerceirosPage.tsx`, `RevisoesPage.tsx`, `RevisaoDetalhePage.tsx`, `ParametrosPage.tsx`, `AppLayout.tsx`, `App.tsx`, `useOrigoData.ts` |

