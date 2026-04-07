

## Plano: Toasts no canto superior direito com animação

### Situação atual

O sistema usa **dois sistemas de toast simultaneamente**:
1. **Sonner** (`src/components/ui/sonner.tsx`) — posicionado no canto inferior direito por padrão
2. **Radix Toast** (`src/components/ui/toaster.tsx` + `useToast`) — usado em ~30 arquivos, posicionado bottom-right em desktop

Ambos precisam ser unificados no **canto superior direito** com animação suave.

### Solução

**1. Configurar Sonner para top-right com animação (`sonner.tsx`):**
- Adicionar `position="top-right"` e `richColors` ao componente `<Sonner>`
- Ajustar estilos para combinar com o design system (bordas, sombras)

**2. Ajustar Radix Toast viewport para top-right (`toast.tsx`):**
- Alterar o `ToastViewport` de `sm:bottom-0 sm:right-0 sm:top-auto` para `top-0 right-0`
- Trocar animações de `slide-in-from-bottom` para `slide-in-from-top` / `slide-in-from-right`

**3. Adicionar toasts de feedback onde estão faltando:**
- Revisar operações CRUD principais que ainda não exibem feedback (sucesso/erro)
- Garantir que todas as ações de criar, editar, excluir, aprovar, rejeitar tenham toast

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/components/ui/sonner.tsx` — `position="top-right"`, `richColors`, animação |
| Editar | `src/components/ui/toast.tsx` — viewport top-right, animações de entrada pela direita |

