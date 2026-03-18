

## Plano: 3 Frentes -- Sync Incremental, Perfis CRUD, Motor de Regras (modo manual)

### 1. Sync Incremental (sem delete-all)

Reescrever `sync-csv-colab/index.ts` para comparar CSV vs banco por matricula:

- **Parse CSV** -- todas as linhas, sem dedup (como hoje)
- **Buscar existentes** com `origem='csv'` em Map<matricula, {id, dados}>
- **Classificar cada linha**:
  - Matricula nova no banco → INSERT
  - Matricula existe mas dados mudaram → UPDATE (por id)
  - Matricula existe e dados iguais → skip
- **Leavers**: matriculas no banco que nao estao no CSV → DELETE + evento leaver
- **Para duplicatas no CSV** (mesmo employID aparece N vezes): como o usuario quer todas as linhas, linhas com mesmo employID alem da primeira recebem sufixo posicional (`_ROW_2`, `_ROW_3`) para manter unicidade no banco
- Comparacao de mudanca: comparar campos concatenados (nome, email, status, empresa, cargo, area, localidade) -- sem hash criptografico, string simples

Mesma logica aplicada a `sync-sharepoint-csv/index.ts`.

### 2. Perfis de Acesso -- CRUD funcional

**`PerfisAcessoPage.tsx`**: Adicionar Dialog com form para criar/editar perfil (nome, descricao, aplicacao_id, tipo, sensibilidade, ativo). Botao "Novo Perfil" abre dialog. Acao de editar/excluir na tabela.

**`PerfilAcessoDetalhePage.tsx`**: Botao "Editar" abre dialog funcional. Adicionar CRUD para composicao (adicionar/remover itens de `perfil_composicao` com tipo, nome, detalhe).

### 3. Motor de Regras -- salvar e simular (SEM execucao automatica)

O usuario pediu explicitamente que o sistema **nao faca nada automatico** por enquanto. Os colaboradores importados ja estao criados no Entra ID.

**`RegraEditorPage.tsx`**:
- Conectar "Salvar Rascunho" e "Ativar Regra" para persistir no banco (`regras`, `regra_condicoes`, `regra_resultados`)
- Usar `useRef` ou state controlado nos campos em vez de `defaultValue`
- Selecionar perfil_id real no resultado (nao nome)

**Edge function `execute-rules/index.ts`**:
- Criar mas com execucao **somente manual** (chamada via botao na UI)
- Avalia regras ativas contra colaboradores e retorna preview de atribuicoes (`perfil_atribuicoes` que seriam criadas)
- **Modo simulacao por padrao**: retorna lista de acoes sem executar
- **Modo executar**: aceita flag `{ execute: true }` para de fato criar `perfil_atribuicoes`, mas so e chamado manualmente
- Nenhum trigger automatico na importacao CSV -- o sync apenas registra eventos JML informativos

**UI para execucao manual**:
- Na `RegraEditorPage`, o botao "Simular" chama `execute-rules` em modo simulacao e mostra resultado
- Adicionar botao "Executar regra" que chama com `{ execute: true, regra_id }` apos confirmacao

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Reescrever | `supabase/functions/sync-csv-colab/index.ts` |
| Reescrever | `supabase/functions/sync-sharepoint-csv/index.ts` |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Editar | `src/pages/regras/RegraEditorPage.tsx` |
| Criar | `supabase/functions/execute-rules/index.ts` |

