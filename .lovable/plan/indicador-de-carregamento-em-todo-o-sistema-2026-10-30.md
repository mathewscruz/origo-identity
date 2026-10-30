# Indicador de carregamento em todo o sistema

## O que você vai ver
1. **Carregando do banco** — no lugar do texto "Carregando dados…", cada lista, tabela, cartão e gráfico mostra um esqueleto animado (blocos cinza pulsando no formato do conteúdo: linhas de tabela, cartões, barras do gráfico). Os números dos indicadores do topo também pulsam até chegar o valor real.
2. **Atualizando em segundo plano** — quando a tela já tem dados e está buscando versão nova (a cada 30 s ou após o Hermes terminar), aparece uma barrinha teal fina e animada no topo da página, sem esconder o que já está na tela.
3. **Hermes consultando** — enquanto há um pedido de atualização aguardando o Hermes, aparece ao lado do título um selo discreto com ícone girando: "Hermes atualizando…". Some quando o Hermes conclui e os dados novos chegam.
4. **Painéis laterais e fichas** (Colaborador, Terceiro, Licença, Aplicação, Fila) — esqueleto próprio enquanto abrem.
5. **Botões de ação** (salvar, desligar, aplicar, enviar ao Hermes) — ícone girando e botão bloqueado enquanto a ação roda, onde ainda não existir.

## Telas cobertas
Início, Fila, Colaboradores, Terceiros, Contas de serviço, Quarentena, Licenças, Aplicações (lista e detalhe), Privilegiados, Perfis, SoD, Exceções, Revisões, Auditoria, Alertas, Relatórios, Configurações, e análise do Hermes em "Conectar sistema".

## Detalhes técnicos
- `QueryState`: trocar texto por variantes de skeleton (`table`, `cards`, `chart`, `panel`) usando `ui/skeleton`.
- Novo `GlobalFetchBar` no `AppLayout` usando `useIsFetching()` do React Query (só refetch, não carga inicial).
- `useAutoRefresh` já expõe `state` ("waiting"/"loading"); novo `HermesSyncBadge` no `PageHeader` reaproveita isso, sem novos pedidos ao Hermes.
- `StatCard`/`MetricStrip`: prop `loading` mostra skeleton no valor.
- Páginas que usam `isLoading` com texto solto passam a usar as variantes.
- Sem mudança de dados ou regras; só apresentação.
