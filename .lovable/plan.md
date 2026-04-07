

## Plano: Melhorias no módulo de Exceções de Acesso

### Problemas e inconsistências encontrados

**1. Formulário usa texto livre em vez de dados reais do sistema**
Os campos "Colaborador", "Perfil solicitado" e "Solicitante" são inputs de texto livre. O sistema tem tabelas de `colaboradores` e `perfis_acesso` com dados reais. Deveria usar selects/comboboxes vinculados a essas tabelas, preenchendo automaticamente `colaborador_id` e `perfil_id` (que existem na tabela `excecoes` mas nunca são usados).

**2. Aprovar exceção não gera nenhuma ação no Entra ID**
Quando uma exceção é aprovada, o status muda para "aprovada" mas nada acontece. O perfil solicitado não é atribuído ao colaborador no Entra ID. A aprovação é puramente documental.

**3. Não há registro de quem aprovou/rejeitou**
O campo `aprovador` existe na tabela mas nunca é preenchido na função `handleDecision`. Não há rastreabilidade.

**4. Exceções expiradas não são detectadas automaticamente**
Não existe nenhum mecanismo que mude o status para "expirada" quando a validade passa. Exceções aprovadas com validade vencida continuam como "aprovada".

**5. Falta busca/filtro na listagem**
Não há campo de busca por nome de colaborador ou solicitante.

**6. Não há confirmação antes de aprovar/rejeitar**
Os botões de aprovar/rejeitar executam imediatamente sem confirmação ou campo para comentário/justificativa da decisão.

**7. Falta coluna de data de criação**
Não é possível ver quando a exceção foi solicitada.

**8. Não há página de detalhe**
Não existe uma view expandida da exceção com histórico completo.

### Melhorias propostas

#### A. Vincular formulário a dados reais
- Substituir "Colaborador" por um combobox com busca na tabela `colaboradores`
- Substituir "Perfil solicitado" por um combobox com busca na tabela `perfis_acesso`
- Preencher `colaborador_id` e `perfil_id` automaticamente ao selecionar
- Manter os campos de texto como fallback (preenchidos automaticamente com o nome selecionado)
- "Solicitante" pode usar o nome do usuário logado como padrão

#### B. Provisionar acesso ao aprovar
- Quando status muda para "aprovada" e há `colaborador_id` + `perfil_id`:
  - Criar `perfil_atribuicoes` com `origem = 'excecao'`
  - Gerar ações na `iam_queue` para atribuir apps/licenças/grupos do perfil
  - Triggerar processamento no Entra ID
- Quando a exceção expira ou é revogada, reverter as ações

#### C. Registrar aprovador e adicionar confirmação
- Preencher campo `aprovador` com o nome/email do usuário logado
- Antes de aprovar/rejeitar, abrir dialog de confirmação com campo de comentário opcional
- Registrar na auditoria

#### D. Adicionar busca e data de criação
- Campo de busca filtrando por colaborador, solicitante ou perfil
- Coluna "Solicitado em" com a data de criação formatada

#### E. Detecção automática de expiração
- No frontend: ao carregar a lista, marcar visualmente exceções aprovadas com validade vencida
- Opcional futuro: cron/trigger no backend para atualizar status e revogar acesso

#### F. Contadores no header
- Cards com totais: Pendentes, Aprovadas, Expiradas, Total

### Arquivos a alterar

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/excecoes/ExcecoesPage.tsx` — comboboxes, busca, confirmacao, provisioning, contadores |

### Ordem de implementacao

1. Adicionar contadores no header e busca na listagem
2. Substituir inputs por comboboxes vinculados a dados reais
3. Adicionar dialog de confirmacao com campo de comentario ao aprovar/rejeitar
4. Registrar aprovador e criar entrada na auditoria
5. Provisionar acesso no Entra ID ao aprovar (criar perfil_atribuicoes + iam_queue)
6. Detectar e marcar exceções expiradas visualmente

