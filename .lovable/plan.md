

# Plano: Permissionamento individual por pasta/subpasta no SharePoint

## Problema atual
O fluxo atual exige selecionar site, pasta e permissao separadamente e adicionar um item por vez. Nao permite definir permissoes diferentes para pastas diferentes dentro do mesmo site de forma intuitiva.

## Solucao: Arvore de pastas com permissao por item

Redesenhar a aba SharePoint para mostrar uma **arvore hierarquica de pastas** apos selecionar o site. Cada pasta/subpasta tera um seletor de permissao individual ao lado (Leitura / Escrita / Controle Total / Nenhuma).

### Fluxo do usuario
1. Seleciona o site SharePoint (combobox com busca, como ja existe)
2. As pastas do site carregam automaticamente em formato de arvore expandivel
3. Cada pasta mostra um seletor de permissao ao lado (dropdown ou badges clicaveis)
4. O usuario define a permissao desejada para cada pasta/subpasta individualmente
5. Subpastas herdam a permissao do pai por padrao, mas podem ser sobrescritas
6. As permissoes definidas aparecem em um resumo abaixo

### UI proposta
```text
[Site: Seguranca da Informacao     v] [Buscar...]

Pastas do site:
  > Documentos           [Leitura v]
    > Politicas          [Escrita v]  (sobrescrito)
    > Templates          [--herda--]
  > Relatórios           [Nenhuma  ]
  > Projetos             [Controle Total v]
    > 2024               [--herda--]

Resumo de permissoes adicionadas:
  SI / Documentos            Leitura    [x]
  SI / Documentos / Politicas  Escrita  [x]
  SI / Projetos              Controle Total [x]
```

### Mudancas tecnicas

| Arquivo | Alteracao |
|---|---|
| `src/pages/perfis-acesso/PerfisAcessoPage.tsx` | Reescrever a aba SharePoint: arvore de pastas com permissao individual por item, heranca do pai, resumo de permissoes |
| `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` | Mesmo ajuste na visualizacao/edicao de permissoes SharePoint |

### Detalhes de implementacao
- Componente de arvore usando `Collapsible` para expandir/colapsar pastas
- Cada no da arvore tem um `Select` com opcoes: "Nenhuma", "Leitura", "Escrita", "Controle Total"
- Ao definir permissao em uma pasta, todas subpastas mostram "(herda: Leitura)" ate que sejam sobrescritas
- `spItems` continua sendo o array salvo no banco, mas agora cada pasta pode ter sua propria permissao
- O site inteiro pode receber permissao (sem pasta selecionada = acesso ao site completo)
- Pastas sem permissao explicita nao geram registro em `perfil_sharepoint`

### Resultado esperado
- Controle granular de permissoes por pasta e subpasta
- Heranca visual clara entre niveis
- Interface intuitiva sem necessidade de adicionar itens manualmente um a um

