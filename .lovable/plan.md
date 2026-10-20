# Retirar a busca global do topo e do menu lateral

## O que muda
- Sai o campo **"Buscar pessoa, app, perfil…"** do topo da tela.
- Sai o campo **"Buscar ou navegar…"** do menu lateral.
- Sai também a janela de busca que abria com **Ctrl K**, porque ela só servia a esses dois campos.
- As buscas dentro das páginas e tabelas (Pessoas, Aplicações, Licenças, Fila etc.) continuam como estão.

## Detalhes técnicos
- `AppLayout.tsx`: remover o botão de busca do header e o `<CommandPalette />`, junto com os imports.
- `AppSidebar.tsx`: remover o botão "Buscar ou navegar…" e o import de `openCommandPalette`.
- Apagar `src/components/CommandPalette.tsx` se não houver outra referência a ele. Antes, ajustar os passos do tour (`tourSteps`) que apontem para a busca.
