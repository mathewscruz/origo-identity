

## Plano: CRUD manual de Colaboradores + Atribuicao de Perfis de Acesso

### 1. `ColaboradoresPage.tsx` — Adicionar/Editar/Remover colaborador

**Botao "Novo Colaborador"** ao lado do "Importar Base". Abre Dialog com formulario:

- Nome (text, obrigatorio)
- Email (text)
- CPF (text)
- Matricula (text)
- Status (select: ativo, inativo, ferias, afastado, desligado)
- Empresa (select from `empresas`)
- Area (select from `areas`)
- Cargo (select from `cargos`)
- Localidade (select from `localidades`)
- Data admissao (date input)

Origem sera definida automaticamente como `"manual"`.

**Edicao**: Botao de editar em cada linha da tabela (icone Pencil), abre o mesmo dialog preenchido.

**Exclusao**: Botao de excluir (icone Trash2) com AlertDialog de confirmacao.

Hooks utilizados: `useEmpresas()`, `useAreas()`, `useCargos()`, `useLocalidades()` ja existem em `useOrigoData.ts`.

### 2. `ColaboradorDetalhePage.tsx` — Atribuir/revogar perfis de acesso

Na aba "Acessos Ativos":

- **Botao "Atribuir Perfil"**: abre Dialog com select de perfis de acesso (from `usePerfisAcesso()`), salva em `perfil_atribuicoes` com `origem='manual'`
- **Botao "Revogar"** (ja existe na UI): conectar ao Supabase para marcar `ativo=false` e `data_revogacao=now()`
- Atualizar a coluna "Aplicacao" para mostrar as apps do perfil via `perfil_aplicacoes` (many-to-many)

### 3. Coluna de acoes na tabela de colaboradores

Adicionar coluna "Acoes" com botoes Editar e Excluir (somente para registros `origem='manual'`, os de CSV ficam somente leitura na listagem — mas podem ser editados na pagina de detalhe).

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |

Nenhuma alteracao de banco necessaria — todas as tabelas e colunas ja existem.

