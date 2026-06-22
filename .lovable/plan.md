## Objetivo

1. Trocar o campo **Responsável** (atualmente texto livre) por uma busca/dropdown de colaboradores ativos, para que o e-mail de revalidação a cada 45 dias chegue ao responsável correto.
2. Garantir que **atribuição/revogação de perfis, grupos, licenças e apps** para terceiros sigam o mesmo padrão dos colaboradores.
3. Garantir que **ativação e desativação** de terceiros aconteça direto na ferramenta (sem depender de planilha ou base externa).

## Mudanças

### 1. Banco de dados (migration)
- Adicionar coluna `responsavel_colaborador_id uuid` em `public.terceiros` referenciando `public.colaboradores(id) ON DELETE SET NULL`, com índice.
- Manter a coluna `responsavel` (texto) como cache do nome+e-mail do responsável escolhido, preenchida automaticamente na gravação — assim relatórios/exportações existentes continuam mostrando algo legível mesmo se o colaborador for removido.

### 2. Formulário de Terceiro (`TerceirosPage.tsx`)
- Substituir o `Input` do Responsável por um Combobox (busca + dropdown) listando colaboradores **ativos** (nome + e-mail), reaproveitando `useColaboradores`.
- Mostrar avatar/iniciais opcional e e-mail como subtítulo dentro da opção, para facilitar a escolha.
- Ao salvar:
  - `responsavel_colaborador_id` ← id selecionado.
  - `responsavel` ← `"Nome Sobrenome <email>"` do colaborador (snapshot para exibição).
- Listagem da tabela: continua mostrando o nome do responsável (vindo do snapshot).

### 3. Detalhe do Terceiro (`TerceiroDetalhePage.tsx`)
- Exibir o responsável como o nome do colaborador vinculado (com link para `/colaboradores/:id`), e o e-mail logo abaixo. Fallback para o texto antigo se não houver vínculo.
- Texto da revalidação automática passa a citar o e-mail real do responsável escolhido.

### 4. E-mail de revalidação (`supabase/functions/auto-recertification/index.ts`)
- Resolver o destinatário pela ordem: e-mail do `responsavel_colaborador_id` → texto `responsavel` se for um e-mail → `terceiro.email` (fallback atual). Atualmente o código assume que o texto contém "@", o que falhava com nomes.

### 5. Validação de paridade com colaboradores (não precisa de código novo, apenas conferência documentada)
A página de detalhe já chama os mesmos helpers usados em colaboradores:
- **Atribuir perfil**: insere em `perfil_atribuicoes` (com `terceiro_id`) e chama `queueFullProfileActions(..., "assign")` + `triggerEntraProcessing()` — idêntico ao colaborador.
- **Revogar perfil**: marca `ativo=false`, `data_revogacao`, e chama `queueFullProfileActions(..., "remove")`.
- **Desligar terceiro**: respeita exceção "Manter Ativo", revoga perfis, remove recursos individuais, enfileira `disable` (AD) e `disable_entra`, cria evento JML `leaver` com snapshot, alerta e auditoria.
- **Reativar terceiro**: enfileira `update` (AD) e `enable_entra`, restaura perfis e recursos do último snapshot `leaver`, evento `joiner`, alerta e auditoria.

Confirmar visualmente após o build que o fluxo continua funcionando para um terceiro real.

## Detalhes técnicos

- Combobox usa `Command` + `Popover` do shadcn (mesmo padrão já presente em outras telas; criar um pequeno componente reutilizável `ColaboradorPicker` em `src/components/` se ficar repetitivo).
- A busca é client-side em cima da lista já carregada por `useColaboradores`, filtrando por nome ou e-mail.
- O snapshot `responsavel` é o único campo que o código legado (`auto-recertification`, exportações) consome; manter o snapshot evita quebrar nada.
- Tipagem `types.ts` será regerada pela migration aprovada.

## Fora de escopo

- Mudanças em revisões de acesso (`revisoes`) — já funcionam por owner_email.
- Sincronização do responsável quando o colaborador é desativado/removido (o `ON DELETE SET NULL` cobre exclusão; status `desligado` não afeta o vínculo — só passa a constar sem opção viável no dropdown na próxima edição).
