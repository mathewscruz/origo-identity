## Causa real do "loading"

O culpado não é mais um refetch — é a animação de transição de página.

`src/components/PageTransition.tsx` envolve o `<Outlet />` em uma `<div key={location.pathname} className="animate-page-in">`. Como o `key` muda em toda navegação, o React **desmonta e remonta** todo o conteúdo da rota e a classe `animate-page-in` (400ms de fade/slide definida em `tailwind.config.ts`) roda. Resultado: ao clicar em "Cargos" (vindo de outra aba de Configurações ou de outra página), a tela inteira pisca/anima como se estivesse carregando, mesmo com os dados em cache.

Efeito colateral: o remount também descarta estado local da página (busca, paginação, scroll) — não só parece um loading, é um reset real.

## Mudança

Reescrever `PageTransition` para:
- **Não usar `key={location.pathname}`** — assim o React reutiliza a instância do componente entre navegações e o React Query devolve os dados em cache instantaneamente, sem flicker.
- **Remover a classe `animate-page-in`** do wrapper. A animação será mantida no `tailwind.config.ts` (caso seja usada em outros lugares), mas não disparada em toda troca de rota.

```tsx
// src/components/PageTransition.tsx
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

(Mantemos o componente para não quebrar o import em `AppLayout.tsx`; se preferir, posso depois removê-lo totalmente.)

## Resultado esperado
- Clicar em "Cargos" (ou qualquer outra rota com dados já em cache) muda a tela instantaneamente, sem fade nem skeleton.
- O skeleton só aparece no primeiro carregamento real da página (quando o React Query ainda não tem dados).
- Estado local de buscas/paginação por página passa a ser preservado durante a navegação na mesma aba.
