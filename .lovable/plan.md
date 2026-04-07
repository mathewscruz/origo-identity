

## Plano: Atualizar favicon e título do sistema

### Alterações

1. **Favicon** — Copiar `src/assets/logo.png` para `public/favicon.png`, remover `public/favicon.ico` se existir, e atualizar `index.html` com `<link rel="icon" href="/favicon.png">`

2. **Título** — Alterar o `<title>` e meta tags em `index.html` de "Órigo Identity — IGA/IAM" para "Órigo Access & Identity"

3. **Sidebar** — Alterar o texto "Access & Identity" para "Órigo Access & Identity" em `AppSidebar.tsx`

### Arquivos

| Ação | Arquivo |
|---|---|
| Copiar | `src/assets/logo.png` → `public/favicon.png` |
| Editar | `index.html` — favicon + título |
| Editar | `src/components/AppSidebar.tsx` — texto da sidebar |

