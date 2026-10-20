# Visual mais simples e profissional para o Órigo IAM/IGA

## Diagnóstico (a partir das telas e do menu atuais)

1. **Menu grande demais**: 17 itens em 5 grupos. Várias telas mostram a mesma coisa de formas diferentes:
   - Fila de Provisionamento e Eventos JML: as duas acompanham o que o agente vai executar.
   - Alertas (página) e o sino de notificações no topo.
   - Relatórios e Dashboard: indicadores repetidos.
   - SoD, Privilegiados e Licenças: são todos "riscos", cada um com sua página.
2. **Visual genérico**: a fonte Inter é o padrão de qualquer sistema. Cartões, sombras e badges coloridos em excesso deixam as telas carregadas.
3. **Dashboard poluído**: 5 blocos (pendências, JML, execuções, atividade, status), alguns repetindo números da lateral.
4. **Tour de boas-vindas em 8 páginas**: atrapalha quem já usa o sistema todo dia.
5. **Configurações espalhadas**: Empresas, Áreas, Localidades e Cargos ficam cada um numa página separada, sendo apenas cadastros de apoio.
6. **Cores**: a verde-água da marca concorre com muitos badges coloridos (aviso, crítico, info) aparecendo ao mesmo tempo.

## Proposta

### Menu enxuto (17 -> 10 itens, 3 grupos)
```text
Operação      Início · Aprovações e Fila · Pessoas (Colaboradores | Terceiros)
Governança    Aplicações · Perfis de Acesso · Revisões · Exceções · Riscos (SoD | Privilegiados | Licenças)
Controle      Auditoria · Configurações (inclui Usuários)
```
- Eventos JML vira uma aba dentro de "Aprovações e Fila".
- A página Alertas sai; o sino no topo vira o único lugar dos alertas, com o link "ver todos".
- Relatórios vira o botão "Exportar" dentro do Início e da Auditoria.
- Os endereços antigos continuam funcionando e redirecionam para as telas novas.

### Início (Dashboard) focado em "o que eu preciso fazer"
- Topo: 4 números: aguardando aprovação, falhas do agente, revisões abertas, terceiros vencidos. Cada número leva à tela correspondente.
- Um gráfico só: execuções por dia.
- Lista curta de atividade recente.
- Os demais blocos são retirados.

### Identidade visual
- Fonte nova: IBM Plex Sans para o texto e IBM Plex Mono para códigos, matrículas e e-mails. É mais técnica e sóbria.
- Cartões sem sombra, só com borda fina, e mais espaço em branco.
- Badges neutros (cinza) por padrão. Cor só para erro, atenção ou sucesso.
- Títulos de página padronizados: título, uma linha de descrição e as ações à direita.
- Mantém a cor da marca (#16968D), os avisos no canto superior direito e as telas sem rolagem lateral.

### Limpeza
- O tour de boas-vindas aparece uma vez só, no Início. Nas outras páginas vira um botão "?" opcional.
- Configurações em abas: Parâmetros · Integrações · Estrutura (Empresas, Áreas, Localidades e Cargos numa tela só) · Usuários.

## O que não muda
- Nenhuma regra, aprovação, fila, permissão ou dado.
- Nenhuma função é removida, só reorganizada de lugar.

## Detalhes técnicos
- `AppSidebar.tsx`: novo `GROUPS`. Badges somados (fila + JML) com as mesmas métricas.
- As rotas antigas em `App.tsx` ganham `<Navigate>` para as novas (/eventos-jml, /alertas, /relatorios, /sod, /privilegiados, /licencas, /terceiros, /admin/usuarios).
- Páginas com abas: wrapper com `Tabs` reaproveitando as páginas existentes como conteúdo, sem reescrever cada uma.
- `index.css`: tokens de fonte, sombra (none) e badge neutro. Fonte via Google Fonts no `index.html`.
- `OnboardingTour`: renderizado só no Dashboard e acionado por botão nas demais páginas.
- Validação final com capturas de tela das telas principais (desktop 1408px).
