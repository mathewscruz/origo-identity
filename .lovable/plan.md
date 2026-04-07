

## Plano: Corrigir navegação e melhorar experiência do colaborador

### Problemas identificados

1. **Navegação quebrada:** O erro `useContext` da mensagem anterior causou tela branca, impedindo cliques no nome do colaborador. A correção do `vite.config.ts` já foi aplicada, mas pode ser necessário um reload.

2. **Atribuição individual só existe na página de detalhe:** O dropdown "Atribuir Grupo/Licença/App" está apenas em `ColaboradorDetalhePage.tsx`. O popup de edição na listagem (`ColaboradoresPage.tsx`) é apenas para dados cadastrais — não oferece atribuição de recursos.

### Correções

**A. Garantir que o clique no nome funciona:**
- O `<Link to={/colaboradores/${c.id}}>` e a rota `/colaboradores/:id` estão corretos no código. O problema foi o crash do React por HMR. Após o fix do vite.config.ts, a navegação deve funcionar normalmente.

**B. Adicionar atalho de atribuição individual na listagem:**
- Na tabela de colaboradores, adicionar um botão de ação rápida (ícone `Plus`) ao lado dos botões Editar/Excluir que abre um DropdownMenu com as opções: Atribuir Perfil, Grupo, Licença e App — diretamente da listagem, sem precisar entrar na página de detalhe.
- Os dialogs de seleção serão os mesmos já implementados no detalhe, reutilizando a lógica.

**C. Melhorar visibilidade do link de detalhe:**
- Tornar toda a linha da tabela clicável (cursor pointer + navigate on click) além do link no nome, facilitando a navegação.

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — linha clicável + botão de atribuição rápida na coluna Ações |

