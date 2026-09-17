import type { TourStep } from "@/components/OnboardingTour";

export const tourSteps: Record<string, TourStep[]> = {
  dashboard: [
    { target: "[data-tour='kpi-cards']", title: "Indicadores em tempo real", description: "Pessoas ativas, itens aguardando aprovação, fila do agente, falhas, solicitações e alertas — tudo atualizado automaticamente." },
    { target: "[data-tour='chart-provisioning']", title: "Atividade da fila", description: "Concessões, revogações e falhas por dia. Clique na legenda para esconder/mostrar séries e mude o período." },
    { target: "[data-tour='chart-requests']", title: "Movimentações JML", description: "Entradas, mudanças e saídas de pessoas por dia." },
    { target: "[data-tour='timeline']", title: "Atividade recente", description: "Últimas ações da fila e eventos JML — clique para abrir o detalhe." },
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
    { target: "[data-tour='search-filter']", title: "Filtros", description: "Filtre por status, tipo de ação e origem, ou busque por pessoa, conta ou correlation ID. Os filtros ficam na URL." },
    { target: "[data-tour='table']", title: "Fila de ações", description: "Só o Órigo Agente executa. Itens com falha podem ser reenviados; itens abertos podem ser cancelados; aprovações acontecem na Aprovação IAM.", position: "top" },
  ],
  configuracoes: [
    { target: "[data-tour='nav']", title: "Menu de Configurações", description: "Navegue entre as configurações do sistema: Cargos, Áreas, Empresas, Localidades, Parâmetros, Integrações, Auditoria e Alertas." },
    { target: "[data-tour='content']", title: "Área de Conteúdo", description: "Gerencie os dados cadastrais base que alimentam todo o sistema de identidade e acesso." },
  ],
};
