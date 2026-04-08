
### Diagnóstico real
O erro principal não é só “tempo de scroll”.

1. O `OnboardingTour` está sendo renderizado dentro da própria página, ou seja, dentro de `main` e do `PageTransition`.
2. O `PageTransition` usa `transform` (`animate-page-in`), e isso altera a referência de elementos `position: fixed`. Na prática, o overlay/tooltip não está preso ao viewport real, mas ao bloco animado da página.
3. O `main` também tem padding e scroll próprio, então as coordenadas de `getBoundingClientRect()` e a área onde o tour desenha o destaque ficam desalinhadas.
4. Alguns anchors ainda estão amplos demais, especialmente no Dashboard (`data-tour="kpi-cards"` no grid inteiro), o que piora a sensação de foco “fora do lugar”.

### O que vou ajustar
**1. Tirar o tour de dentro da página**
- Renderizar o tour via portal em `document.body` ou mover sua montagem para um nível acima do `PageTransition`.
- Isso faz `fixed` voltar a usar o viewport real e elimina o deslocamento por sidebar/header/padding/animação.

**2. Desacoplar o tour da animação de página**
- Garantir que o tour não fique dentro de nenhum ancestral com `transform`.
- Se necessário, manter a animação da página normal e o tour como camada global separada.

**3. Refinar a medição**
- Medir o alvo apenas depois de estabilizar layout e gráfico.
- Recalcular com base no scroll container real do alvo.
- Continuar revalidando em resize, scroll e mudança de step.

**4. Corrigir anchors do Dashboard**
- Trocar alvos muito genéricos por alvos mais precisos:
  - KPIs: destacar um card/grupo visual correto, não um wrapper ambíguo.
  - Gráfico de provisionamento: mirar no card inteiro do gráfico.
  - Solicitações: mirar no card correto.
  - Timeline: manter foco no card/lista inteira.

**5. Revisar integração nas páginas**
- Padronizar `data-tour` para sempre apontar para blocos visuais estáveis:
  - toolbar
  - tabs reais
  - card de gráfico
  - tabela/card principal
- Evitar wrappers estruturais que mudam com responsividade.

### Arquivos
| Ação | Arquivo |
|---|---|
| Editar | `src/components/OnboardingTour.tsx` — renderização via portal + ajuste de medição/scroll |
| Editar | `src/components/AppLayout.tsx` ou estrutura global equivalente — posicionar o tour fora de `PageTransition` se necessário |
| Editar | `src/lib/tourSteps.ts` — revisar targets e posições |
| Editar | `src/pages/Dashboard.tsx` — mover `data-tour` para anchors mais precisos |
| Editar | demais páginas com tour — revisar anchors amplos quando necessário |

### Resultado esperado
- O destaque passa a ficar no lugar certo independentemente da resolução.
- Sidebar, header, padding e animações deixam de deslocar o overlay.
- Tooltip e área destacada ficam coerentes entre si.
- O Dashboard deixa de focar áreas erradas no primeiro passo.
