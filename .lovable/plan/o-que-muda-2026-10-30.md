Padronizar as telas no visual "Lista com painel" (opção C)

## O que muda
- Topo: título da tela e, na mesma faixa, uma tira compacta com até 4 números separados por divisórias (ex.: Ativos · Entraram · Saíram · Com erro). Clicar num número filtra a lista. Botão principal à direita.
- Corpo dividido: à esquerda a tabela com busca e filtros; à direita um painel de detalhes que abre ao clicar numa linha, sem sair da página. Fechar (x) devolve a tabela à largura total. O botão "Abrir ficha completa" leva à página atual de detalhe.
- Linhas com foto/ícone, nome + e-mail em duas linhas e etiqueta de situação colorida; linha selecionada destacada em teal.
- Painel: foto, nome, situação, dados principais (matrícula, local, admissão, gestor) e abas curtas (Acessos, Histórico, Riscos) com logos dos sistemas/licenças.

## Telas, em ordem
1. Colaboradores, Terceiros, Contas de serviço
2. Fila (painel mostra etapas da solicitação)
3. Licenças (painel mostra quem usa) e Aplicações (painel mostra dono, revisor, modo e perfis)
4. Privilegiados, SoD, Exceções, Revisões
5. Auditoria (painel mostra o detalhe do evento)

Sem mudar dados, regras ou permissões; só apresentação. Em telas estreitas o painel abre por cima da lista.

## Técnico
- Componentes compartilhados: `PageHeader`, `MetricStrip` (itens clicáveis com query param, mesmo padrão de `dashboardFilters.ts`), `SplitListLayout` (tabela + painel lateral, seleção via `?sel=<id>`), `DetailPanel`, `StatusBadge` único; só tokens do tema.
- Substituir os `StatCard` locais pelo `MetricStrip`, tela a tela, reutilizando as consultas já existentes para o conteúdo do painel.
