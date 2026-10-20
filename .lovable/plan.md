# Remover a apresentação inicial (tour guiado)

## O que muda
- O tour que destaca cada ponto da tela deixa de aparecer em todas as páginas (Início, Colaboradores, Terceiros, Aplicações, Perfis de Acesso, Revisões, Fila, Configurações).
- Nenhum botão ou atalho para "rever o tour" permanece.

## Detalhes técnicos
- Remover `<OnboardingTour .../>` e imports de `OnboardingTour`/`tourSteps` em Dashboard, Terceiros, Colaboradores, Aplicações, Perfis de Acesso, Revisões, Fila de Provisionamento e ConfiguracoesLayout.
- Remover atributos `data-tour` (incluindo PeopleLifecycleChart).
- Apagar `src/components/OnboardingTour.tsx` e `src/lib/tourSteps.ts`; retirar os `vi.mock('@/components/OnboardingTour')` dos testes.
- Apagar a memória `mem://features/onboarding-tour` e sua linha no índice.
- Conferir typecheck e testes.
