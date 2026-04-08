

## Plano: Transicoes suaves entre telas e carregamentos

### Problema

Atualmente a troca de tela usa apenas `animate-fade-in` (do plugin tailwindcss-animate) num div com `key={location.pathname}`. Isso causa um flash — o conteudo anterior desaparece instantaneamente e o novo faz fade-in. Nao ha transicao de saida nem suavizacao nos carregamentos.

### Solucao

**1. Adicionar keyframes customizados no Tailwind config**

Definir animacoes mais suaves e longas:
- `page-in`: fade + leve slide-up (opacity 0→1, translateY 8px→0, duracao 0.4s ease-out)
- `page-out`: fade out rapido (opacity 1→0, duracao 0.15s)
- `content-in`: para cards e secoes internas (opacity 0→1, translateY 4px→0, duracao 0.3s, com delay escalonado)

**2. Criar componente `PageTransition` wrapper**

Componente simples que aplica a animacao de entrada com CSS:
- Recebe `children` e aplica `animate-page-in`
- Usa `key` do pathname para re-trigger
- Adiciona um leve delay (50ms) antes de mostrar para evitar flash

**3. Aplicar `PageTransition` no AppLayout**

Substituir o div com `animate-fade-in` pelo novo componente no `<main>`.

**4. Adicionar animacoes escalonadas nos cards do Dashboard e listagens**

Usar classes utilitarias com `animation-delay` para que cards/linhas aparecam em sequencia (stagger effect):
- Primeiro card: 0ms
- Segundo: 50ms
- Terceiro: 100ms
- Aplicar via CSS custom classes `.stagger-1`, `.stagger-2`, etc.

**5. Suavizar carregamentos (loading states)**

Adicionar transicao nos skeletons/spinners existentes — quando o conteudo real aparece, ele faz fade-in em vez de substituicao brusca. Criar uma classe `.loading-fade` que anima opacity de 0 a 1 em 0.3s.

**6. Transicao no Portal tambem**

Aplicar o mesmo `PageTransition` no `PortalLayout.tsx`.

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `tailwind.config.ts` — adicionar keyframes page-in, content-in, stagger classes |
| Editar | `src/index.css` — adicionar classes utilitarias .stagger-1 a .stagger-6 e .loading-fade |
| Criar | `src/components/PageTransition.tsx` — wrapper de transicao |
| Editar | `src/components/AppLayout.tsx` — usar PageTransition no main |
| Editar | `src/pages/portal/PortalLayout.tsx` — usar PageTransition |
| Editar | `src/pages/Dashboard.tsx` — adicionar stagger nos cards/graficos |

