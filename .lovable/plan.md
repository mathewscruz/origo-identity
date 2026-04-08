
## Plano: corrigir o onboarding de forma realmente estável

### Diagnóstico
O problema não é só “tempo de scroll”. Pela revisão do código e do replay, há 3 causas combinadas:

1. O tour ainda mede enquanto o elemento está se movendo.
2. O cálculo usa alvos muito amplos em alguns passos (`kpi-cards`, wrappers de filtros/ações), então o destaque parece “fora” mesmo quando o seletor bate.
3. O auto-scroll atual não considera bem a área útil real da tela (header fixo + container `main`), então em certas resoluções o foco fica deslocado.

### O que vou ajustar

**1. Reescrever a lógica de posicionamento do `OnboardingTour`**
- Parar de depender de timeout fixo como fonte principal.
- Medir o alvo até ele “estabilizar” antes de exibir/atualizar o destaque.
- Usar a área visível real do app para decidir se precisa scrollar.
- Fazer scroll manual no container correto, sem `scrollIntoView`.

**2. Considerar header + viewport corretamente**
- Definir uma “safe area” para o tour não jogar o foco embaixo do header.
- Calcular posição sempre em coordenadas de viewport, já que overlay e tooltip são `fixed`.

**3. Tornar o tour resiliente a resolução e layout responsivo**
- Recalcular em:
  - resize
  - scroll do container correto
  - mudança de step
  - pequenas mudanças de layout após render
- Adicionar observação leve do elemento alvo para reagir a mudanças de tamanho/posição.

**4. Corrigir os anchors do tour**
- Revisar `tourSteps` e os `data-tour` das páginas.
- Onde o seletor hoje aponta para um wrapper grande demais, trocar por um alvo mais preciso e visualmente coerente:
  - cards específicos
  - card inteiro do gráfico
  - toolbar real
  - tabs list real
- No Dashboard, ajustar principalmente o primeiro passo para não parecer que está focando a área errada.

**5. Melhorar o tooltip**
- Fazer “flip” automático quando a posição escolhida não couber bem.
- Manter o tooltip perto do alvo sem invadir header/bordas.
- Evitar parecer que tooltip e foco pertencem a áreas diferentes.

**6. Robustez**
- Gerar `mask id` único por instância para evitar conflito.
- Se o alvo não estabilizar ou não existir, pular o passo com fallback limpo.

### Arquivos
| Ação | Arquivo |
|---|---|
| Editar | `src/components/OnboardingTour.tsx` — refatorar cálculo, scroll, estabilização e posicionamento |
| Editar | `src/lib/tourSteps.ts` — refinar posições e passos |
| Editar | páginas com `data-tour` relevantes (principalmente `src/pages/Dashboard.tsx`) — mover anchors para elementos mais precisos |

### Resultado esperado
- O destaque passa a cair no elemento certo em qualquer resolução.
- O onboarding deixa de “correr atrás” da tela durante scroll.
- Tooltip e área destacada ficam coerentes visualmente.
- Os passos ficam mais precisos, especialmente em dashboard, filtros, tabelas e gráficos.
