

## Plano: Remover scroll do menu lateral em telas menores

### Problema
O `SidebarContent` usa `overflow-auto` por padrao (definido no componente base em `sidebar.tsx`), o que gera scroll vertical quando a tela e menor que o conteudo do menu.

### Solucao
Duas alteracoes combinadas para que o menu sempre caiba sem scroll:

1. **Reduzir espacamento dos itens** — diminuir padding dos grupos e gap entre itens para compactar o menu verticalmente.

2. **Desabilitar overflow no SidebarContent** — passar `className="overflow-hidden"` no `SidebarContent` dentro do `AppSidebar` (nao precisa alterar o componente base).

3. **Reduzir tamanho dos labels de grupo e itens** — usar fontes menores e alturas menores nos itens para que tudo caiba em telas de ~768px+.

### Alteracoes

**Editar `src/components/AppSidebar.tsx`:**
- Adicionar `className="overflow-y-hidden"` ao `SidebarContent`
- Reduzir padding dos `SidebarGroup` (de `p-2` padrao para `py-1 px-2`)
- Reduzir `gap` dos `SidebarMenu` para `gap-0.5`
- Usar `size="sm"` nos `SidebarMenuButton` para altura menor (h-7 ao inves de h-8)
- Reduzir padding do header e footer

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/components/AppSidebar.tsx` — compactar espacamento e desabilitar scroll |

