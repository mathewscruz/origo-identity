# Menu lateral compacto com submenus

## O que muda
- O menu lateral vira uma coluna estreita e escura, como na imagem: logo no topo, cada item com ícone e o nome pequeno embaixo, centralizados. "Sair" fica no rodapé.
- O item da página aberta fica destacado com fundo suave e uma barra teal à esquerda (cor do sistema, não roxo).
- Os avisos numéricos (fila, terceiros vencidos, revisões, exceções) continuam como bolinha no canto do ícone.
- Itens com mais de uma tela abrem, ao clicar, um painel ao lado com as opções:
  - Aprovações e Fila: Fila, Eventos JML, Aprovação
  - Pessoas: Colaboradores, Terceiros
  - Riscos: Segregação de funções, Privilegiados, Licenças
  - Auditoria: Auditoria, Relatórios, Alertas
  - Configurações: Configurações, Usuários do painel
- Itens com uma só tela (Início, Aplicações, Perfis, Revisões, Exceções) navegam direto.
- O painel fecha ao escolher uma opção, clicar fora ou apertar Esc. Os títulos de seção ("Operação", "Governança"...) saem; os itens mantêm a mesma ordem.
- Status do Hermes e dados do usuário passam para ícones discretos no rodapé, com detalhe ao passar o mouse. Configurações continua escondido para Suporte e Leitor.
- Sem rolagem lateral; em telas baixas, a lista do meio se compacta.

## Detalhes técnicos
- Reescrever `src/components/AppSidebar.tsx` como rail fixo (~w-24) usando tokens do tema (`sidebar-*`, `primary`); campo `children` opcional em `Item`, renderizado num `Popover` (side="right").
- Ajustar `AppLayout.tsx` para a nova largura e remover o colapso antigo, se existir.
- Conferir no navegador o destaque ativo e a abertura dos submenus.
