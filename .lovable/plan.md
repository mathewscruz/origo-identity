

## Plano: Tour guiado de primeiro acesso por pagina

### Abordagem

Criar um sistema de onboarding tour que apresenta as funcionalidades de cada pagina na primeira visita do usuario. O estado de "ja visto" sera salvo no `localStorage` por usuario (usando o `user.id` como chave). O tour destaca elementos da pagina com overlay escuro e tooltip explicativo.

### Componentes

**1. Criar `src/components/OnboardingTour.tsx`**

Componente reutilizavel que recebe uma lista de steps:
```typescript
interface TourStep {
  target: string;       // CSS selector do elemento a destacar
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}
```

Funcionamento:
- Renderiza overlay escuro (backdrop) com recorte no elemento alvo (usando `getBoundingClientRect`)
- Tooltip posicionado ao lado do elemento com titulo, descricao, botao "Proximo" e "Pular"
- Indicador de progresso (1/5, 2/5...)
- Ao completar ou pular, salva `onboarding_{userId}_{pageKey} = true` no localStorage
- Verifica no mount se ja foi visto — se sim, nao renderiza nada

**2. Criar `src/lib/tourSteps.ts`**

Arquivo centralizado com os steps de cada pagina:

| Pagina | Steps (resumo) |
|---|---|
| Dashboard | KPIs, Graficos de provisionamento, Timeline de atividades |
| Colaboradores | Tabela de colaboradores, Filtros, Botao importar |
| Terceiros | Lista de terceiros, Status, Acoes |
| Aplicacoes | Cards de aplicacoes, Conector, Perfis |
| Perfis de Acesso | Lista de perfis, Vinculacao a aplicacoes |
| Revisoes | Campanhas, Status, Acoes de revisao |
| Fila Provisionamento | Fila pendente, Acoes, Filtros |
| Solicitacoes | Lista, Status, Aprovacao |
| Configuracoes | Menu lateral, Sub-paginas disponiveis |
| Matriz | Visualizacao de matriz, Filtros |

**3. Integrar nas paginas**

Cada pagina adiciona `<OnboardingTour pageKey="dashboard" steps={tourSteps.dashboard} />` no final do JSX. O componente cuida de todo o resto.

### Detalhes tecnicos

- **Persistencia:** localStorage com chave `origo_tour_{userId}_{pageKey}`
- **Posicionamento:** `getBoundingClientRect()` + `position: fixed` para overlay e tooltip
- **Scroll:** `element.scrollIntoView({ behavior: "smooth", block: "center" })` antes de cada step
- **Resize:** listener para recalcular posicao
- **Z-index:** overlay em `z-[9998]`, tooltip em `z-[9999]`
- **Botoes:** "Pular" (ghost, fecha tudo) | "Anterior" (outline) | "Proximo"/"Concluir" (primary)
- **Visual:** Card com sombra, seta apontando para o elemento, animacao de fade-in

### Arquivos

| Acao | Arquivo |
|---|---|
| Criar | `src/components/OnboardingTour.tsx` — componente do tour |
| Criar | `src/lib/tourSteps.ts` — definicoes de steps por pagina |
| Editar | `src/pages/Dashboard.tsx` — adicionar tour |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — adicionar tour |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — adicionar tour |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — adicionar tour |
| Editar | `src/pages/perfis-acesso/PerfisAcessoPage.tsx` — adicionar tour |
| Editar | `src/pages/revisoes/RevisoesPage.tsx` — adicionar tour |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — adicionar tour |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — adicionar tour |
| Editar | `src/pages/configuracoes/ConfiguracoesLayout.tsx` — adicionar tour |
| Editar | `src/pages/matriz/MatrizPage.tsx` — adicionar tour |

