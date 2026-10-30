# Novo visual do Início (modelo C) com tema escuro e claro

Só aparência: números, regras, links e filtros continuam iguais. Dados reais, menu atual.

## O que muda
1. **Botão de tema** no topo (sol/lua): escuro (padrão do modelo C) ou claro; a escolha fica salva por usuário no navegador e vale para o sistema todo.
2. **Faixa única de indicadores** no topo, separada por divisórias: Pessoas ativas, Execuções, Aguardando aprovação, Falhas em 24 h — ícone em círculo colorido (teal, teal, âmbar, vermelho), número grande e variação vs. período anterior. Cada um continua abrindo a lista filtrada.
3. **Gráfico largo "Entradas e saídas por dia"** em linhas finas suaves (teal para entradas, rosa para saídas) com preenchimento leve; seletor 7/30/90 dias no canto. O gráfico "Movimentações de pessoas" deixa de existir separado.
4. **Quatro cartões na base, lado a lado:**
   - Categoria de Usuários: barras horizontais com número e %, clicáveis.
   - Licenças em uso: nome, barra e % de uso.
   - Pendências de governança: lista com selo âmbar de contagem e seta, abrindo os mesmos filtros de hoje.
   - Atividade recente: ícones atuais, "Ver toda a atividade".
5. Título "Governança de Identidades" com a linha discreta do Hermes abaixo; cantos arredondados, bordas sutis, sem sombras.
6. Os atalhos pequenos de pendências do topo saem (já estão no cartão de pendências).

## Detalhes técnicos
- Tema: classe `dark` no `<html>`, tokens escuros em `src/index.css` ajustados ao modelo C (fundo ~#0B1416, cartão ~#13222A, teal #16968D, âmbar, rosa); tokens de gráfico `--chart-in`/`--chart-out`. Alternância em componente no topo (`AppLayout`) com `localStorage`.
- `Dashboard.tsx`: nova faixa de KPIs, `AreaChart` com `type="monotone"` e gradiente, grid de 4 colunas na base (2 em telas médias, 1 em pequenas).
- Sem mudar consultas/RPCs/`dashboardFilters.ts`; testes do dashboard devem passar. Verificar com captura nos dois temas.
