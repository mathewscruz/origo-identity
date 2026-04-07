

## Plano: Alterar cor primária de azul para #16968D em todo o sistema

### Conversão

`#16968D` em HSL = `176 74% 34%`

### Alteração

Trocar todas as referências à cor primária azul (`221 83% 53%`) pela nova cor teal `176 74% 34%` no arquivo `src/index.css`. Isso afeta automaticamente todos os botões, links, badges, sidebar highlights, rings, focus states e qualquer elemento que use `primary`, `ring`, `sidebar-primary` ou `sidebar-ring`.

### Variáveis a alterar

**Tema claro (:root):**
- `--primary: 221 83% 53%` → `176 74% 34%`
- `--ring: 221 83% 53%` → `176 74% 34%`
- `--sidebar-primary: 221 83% 53%` → `176 74% 34%`
- `--sidebar-ring: 221 83% 53%` → `176 74% 34%`

**Tema escuro (.dark):**
- `--primary: 221 83% 53%` → `176 74% 34%`
- `--ring: 221 83% 53%` → `176 74% 34%`
- `--sidebar-primary: 221 83% 53%` → `176 74% 34%`
- `--sidebar-ring: 221 83% 53%` → `176 74% 34%`

### Impacto

Como todo o sistema usa CSS variables via Tailwind (`bg-primary`, `text-primary`, `ring-primary`, etc.), a mudança em um único arquivo propaga automaticamente para:
- Tela de login (botão "Entrar", links)
- Sidebar (item ativo, hover)
- Todos os botões primários em todos os módulos
- Focus rings em inputs e selects
- Badges e links com cor primária

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/index.css` — substituir 4 variáveis no tema claro + 4 no tema escuro |

