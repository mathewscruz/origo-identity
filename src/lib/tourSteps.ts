import type { TourStep } from "@/components/OnboardingTour";

export const tourSteps: Record<string, TourStep[]> = {
  dashboard: [
    { target: "[data-tour='kpi-cards']", title: "KPIs em Tempo Real", description: "Acompanhe os indicadores-chave: colaboradores ativos, alertas críticos, aplicações conectadas e revisões em andamento." },
    { target: "[data-tour='chart-provisioning']", title: "Gráfico de Provisionamento", description: "Visualize as ações de provisionamento ao longo do tempo. Use os botões Dia, Semana, Mês e Ano para alterar o período.", position: "right" },
    { target: "[data-tour='chart-requests']", title: "Gráfico de Solicitações", description: "Monitore as solicitações de acesso por status. Alterne entre períodos para identificar tendências.", position: "left" },
    { target: "[data-tour='timeline']", title: "Atividades Recentes", description: "Linha do tempo com as últimas ações do sistema — provisionamentos e solicitações em tempo real." },
  ],
  colaboradores: [
    { target: "[data-tour='search-filter']", title: "Busca e Filtros", description: "Pesquise colaboradores por nome, matrícula ou e-mail. Use os filtros de status, empresa e área para refinar a lista." },
    { target: "[data-tour='actions']", title: "Ações Rápidas", description: "Importe colaboradores via CSV, sincronize com o diretório ou adicione manualmente." },
    { target: "[data-tour='table']", title: "Tabela de Colaboradores", description: "Clique nas colunas para ordenar. Clique em um colaborador para ver seus detalhes, perfis e acessos.", position: "top" },
  ],
  terceiros: [
    { target: "[data-tour='search-filter']", title: "Busca e Filtros", description: "Filtre terceiros por nome, empresa ou criticidade." },
    { target: "[data-tour='actions']", title: "Novo Terceiro", description: "Cadastre prestadores de serviço com informações de contrato, criticidade e responsável." },
    { target: "[data-tour='table']", title: "Lista de Terceiros", description: "Gerencie o ciclo de vida dos terceiros: ative, desative ou exclua. Clique para ver detalhes e perfis vinculados.", position: "top" },
  ],
  aplicacoes: [
    { target: "[data-tour='kpi-cards']", title: "Resumo de Aplicações", description: "Veja o total de aplicações, quantas são Azure SSO, críticas e sem owner definido." },
    { target: "[data-tour='search-filter']", title: "Filtros", description: "Filtre por nome, origem (Azure/Manual) e nível de criticidade." },
    { target: "[data-tour='table']", title: "Catálogo de Aplicações", description: "Cada aplicação mostra origem, autenticação, owner e status de integração. Clique para ver perfis e detalhes.", position: "top" },
  ],
  perfis_acesso: [
    { target: "[data-tour='search-filter']", title: "Busca por Perfil", description: "Encontre perfis de acesso por nome. Filtre por tipo (funcional, técnico, privilegiado)." },
    { target: "[data-tour='actions']", title: "Novo Perfil", description: "Crie perfis vinculando aplicações, grupos do AD, licenças e roles internos." },
    { target: "[data-tour='table']", title: "Lista de Perfis", description: "Veja todos os perfis com suas vinculações. Clique para editar aplicações e grupos associados.", position: "top" },
  ],
  revisoes: [
    { target: "[data-tour='actions']", title: "Nova Campanha", description: "Crie campanhas de recertificação de acessos. Selecione uma aplicação para gerar os itens de revisão automaticamente." },
    { target: "[data-tour='table']", title: "Campanhas de Revisão", description: "Acompanhe o progresso de cada campanha: itens revisados, prazo e status. Clique para revisar os acessos individualmente.", position: "top" },
  ],
  fila_provisionamento: [
    { target: "[data-tour='tabs']", title: "Abas de Navegação", description: "Alterne entre a Fila de Provisionamento (ações técnicas) e Eventos JML (Joiner/Mover/Leaver)." },
    { target: "[data-tour='search-filter']", title: "Filtros", description: "Filtre por tipo de ação, status e busque por identidade ou colaborador." },
    { target: "[data-tour='table']", title: "Fila de Ações", description: "Veja as ações pendentes, em processamento e concluídas. Ações com falha podem ser reprocessadas.", position: "top" },
  ],
  solicitacoes: [
    { target: "[data-tour='tabs']", title: "Tipos de Solicitação", description: "Alterne entre solicitações pendentes (aguardando decisão) e o histórico completo." },
    { target: "[data-tour='actions']", title: "Nova Solicitação", description: "Solicite acesso a perfis, aplicações e grupos para colaboradores. Inclua justificativa obrigatória." },
    { target: "[data-tour='table']", title: "Lista de Solicitações", description: "Aprove ou rejeite solicitações. Cada uma mostra o solicitante, perfil desejado e status atual.", position: "top" },
  ],
  configuracoes: [
    { target: "[data-tour='nav']", title: "Menu de Configurações", description: "Navegue entre as configurações do sistema: Cargos, Áreas, Empresas, Localidades, Parâmetros, Integrações, Auditoria e Alertas." },
    { target: "[data-tour='content']", title: "Área de Conteúdo", description: "Gerencie os dados cadastrais base que alimentam todo o sistema de identidade e acesso." },
  ],
  matriz: [
    { target: "[data-tour='matrix']", title: "Matriz Cargo × Perfil", description: "Visualize quais perfis de acesso estão vinculados a cada cargo. ✓ indica vínculo direto, ⚙ indica vínculo via regra automatizada." },
    { target: "[data-tour='actions']", title: "Exportar", description: "Exporte a matriz em formato CSV para relatórios e auditorias." },
  ],
};
