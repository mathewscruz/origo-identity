# Início idêntico ao anexo, ocupando a tela toda

Só aparência. Números, filtros e links continuam reais. Tema claro continua disponível pelo botão sol/lua.

## O que muda
1. **Largura total**: remover o limite de largura; tudo vai de borda a borda da área de conteúdo, e os 4 cartões de baixo se esticam em altura até o fim da tela (sem espaço vazio).
2. **Topo como no anexo**: "Governança de Identidades" grande, "Visibilidade. Controle. Conformidade." abaixo; à direita, foto + nome + papel do usuário (ex.: "Mathews Cruz · Super Admin"). A linha do Hermes/RH fica pequena junto ao subtítulo.
3. **Faixa de indicadores**: rótulos curtos (Pessoas ativas, Execuções, Aguardando, Falhas), círculo grande escuro com ícone colorido, número grande, triângulo ▲/▼ verde ou vermelho com % e "vs. período anterior".
4. **Gráfico**: linhas curvas suaves com preenchimento degradê (teal entradas, rosa saídas), grade fina vertical e horizontal, legenda à direita, seletor "Últimos 30 dias ▾" em menu (7/30/90).
5. **Cartões de baixo, cada um com ícone no título**:
   - Categoria de Usuários (ícone pessoas): nome, barra grossa teal arredondada, número e % à direita.
   - Licenças em uso (ícone cubo): **logo do produto** à esquerda (Microsoft 365, Teams, Exchange, Dynamics, Power Platform, Copilot, Project, Visio etc., por reconhecimento do nome; genérico se não reconhecer), nome, barra teal e % em teal.
   - Pendências de governança (ícone escudo): texto, selo quadrado âmbar com borda e seta ›.
   - Atividade recente (ícone pulso): ícone em quadrado escuro, nome em destaque, descrição abaixo, tempo à direita ("Há 12 min"), "Ver toda a atividade ›".
6. **Fonte**: trocar para Inter (a do anexo) em todo o sistema, com números tabulares.
7. **Cores do tema escuro** afinadas ao anexo: fundo quase preto azulado, cartões com borda sutil, teal ciano mais vivo, rosa nas saídas, âmbar nos selos.

## Fora do escopo (já decidido antes)
- A busca do topo do anexo **não volta** (você pediu para remover).
- O menu lateral fica como está hoje (mesmo estilo do anexo, com seus itens atuais).

## Detalhes técnicos
- `Dashboard.tsx`: remover `max-w`, layout em altura de tela (`min-h-[calc(100vh-…)]`, grid com `flex-1`); novos subcomponentes `KpiStrip`, `UsersCard`, `LicensesCard`, `GovernanceCard`, `RecentCard` (feed compacto reutilizando os rótulos de `activityLabels.ts`).
- `src/components/ProductLogo.tsx`: SVGs inline simples por palavra‑chave do nome da licença (sem imagens externas).
- `index.css`/`tailwind.config.ts`: Inter via Google Fonts, ajuste dos tokens `.dark`.
- Atualizar testes de dashboard só onde mudarem rótulos; rodar a suíte e capturar em 1600 px e 2654 px nos dois temas.
