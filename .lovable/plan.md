

## Plano: Corrigir posicionamento do Onboarding Tour

### Problemas identificados

1. **Scroll container errado**: O conteudo rola dentro de `main.overflow-auto`, mas o tour escuta scroll em `window`. O `scrollIntoView` rola o `main`, porem o listener de scroll nao detecta isso corretamente.
2. **Medicao prematura**: `requestAnimationFrame` dispara antes do `scrollIntoView({ behavior: "smooth" })` completar, capturando coordenadas intermediarias.
3. **Atualizacao continua ausente**: Nao ha polling para recalcular a posicao apos o scroll terminar.

### Solucao

Editar `src/components/OnboardingTour.tsx`:

1. **Remover `scrollIntoView` e usar scroll manual no container correto**: Buscar o container scrollavel (`main.overflow-auto` ou ancestral com overflow) e calcular o scroll necessario para centralizar o elemento.

2. **Usar `setTimeout` de ~400ms apos scroll** em vez de `requestAnimationFrame` para garantir que o scroll suave terminou antes de medir.

3. **Adicionar listener de scroll no container `main`** alem do `window`, usando `document.querySelector("main")` para capturar scrolls internos.

4. **Recalcular posicao com intervalo**: Apos cada mudanca de step, usar um segundo `setTimeout` de ~100ms para re-medir e corrigir qualquer drift.

5. **Fallback robusto**: Se o elemento-alvo nao for encontrado, pular para o proximo step automaticamente em vez de mostrar overlay sem destaque.

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/components/OnboardingTour.tsx` — corrigir logica de scroll, medicao e listeners |

