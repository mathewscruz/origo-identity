/**
 * Rótulos humanos para valores de enum/status/origem do sistema.
 * Regra do produto: todo status/rótulo começa com maiúscula e nunca aparece
 * como código (`waiting_approval`, `status_status`) na tela.
 */
const LABELS: Record<string, string> = {
  // pessoas
  ativo: "Ativo", inativo: "Inativo", ferias: "Férias", afastado: "Afastado", desligado: "Desligado", suspenso: "Suspenso",
  colaborador: "Colaborador", colaboradores: "Colaboradores", terceiro: "Terceiro", terceiros: "Terceiros", gestor: "Gestor", pessoa: "Pessoa",
  // fila / execução
  pending: "Pendente", waiting_approval: "Aguardando aprovação", processing: "Executando", success: "Concluído", done: "Concluído",
  failed: "Falhou", error: "Erro", cancelled: "Cancelado", canceled: "Cancelado", rejected: "Rejeitado", approved: "Aprovado", running: "Em execução",
  queued: "Na fila", skipped: "Ignorado", partial: "Parcial",
  // revisões / decisões
  em_andamento: "Em andamento", concluida: "Concluída", concluido: "Concluído", cancelada: "Cancelada", manter: "Manter", revogar: "Revogar",
  perfil: "Perfil", individual: "Acesso direto", aplicacao: "Aplicação",
  // exceções / aprovações
  pendente: "Pendente", aprovada: "Aprovada", aprovado: "Aprovado", rejeitada: "Rejeitada", rejeitado: "Rejeitado", expirada: "Expirada", expirado: "Expirado",
  revogada: "Revogada", revogado: "Revogado", resolvido: "Resolvido", descartado: "Descartado", ativa: "Ativa", vencida: "Vencida",
  // eventos JML
  joiner: "Joiner", mover: "Mover", leaver: "Leaver", pre_leaver: "Pré-leaver", pre_leaver_revertido: "Pré-leaver revertido", rehire: "Recontratação",
  executado: "Executado", executando: "Executando", aguardando: "Aguardando", aguardando_aprovacao: "Aguardando aprovação", erro: "Erro", falha: "Falha",
  hard: "Definitiva", soft: "Preventiva", suspensao: "Suspensão", desativacao: "Desativação",
  // severidade / criticidade
  info: "Info", aviso: "Aviso", critico: "Crítico", baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica",
  // origens
  manual: "Manual", cargo: "Cargo", excecao: "Exceção", csv: "Importação do RH", csv_colab: "Importação do RH", sharepoint: "SharePoint", entra: "Entra ID", entra_id: "Entra ID",
  entra_sync: "Sincronização Entra", manual_individual: "Manual (direto)", reativacao: "Reativação", revisao: "Revisão", recertificacao: "Recertificação",
  auto_expiracao: "Expiração automática", reconciliacao: "Reconciliação", sistema: "Sistema", agente: "Agente", cron: "Agendado", api: "API", mcp: "Hermes (MCP)",
  hermes: "Hermes", importacao: "Importação", migration: "Migração", scheduler: "Agendador", glpi: "GLPI", portal: "Portal", ad: "AD local",
  cargo_reprovisionamento: "Reprovisionamento de cargo", perfil_exclusao: "Exclusão de perfil", leaver_terceiro: "Desligamento de terceiro",
  // recursos / tipos
  grupo: "Grupo", grupos: "Grupos", licenca: "Licença", licencas: "Licenças", app: "Aplicação", apps: "Aplicações", pasta: "Pasta", site: "Site",
  interno: "Interno", externo: "Externo", saas: "SaaS", onpremises: "On-premises", on_premises: "On-premises", cloud: "Cloud", hibrido: "Híbrido",
  sso: "SSO", saml: "SAML", oidc: "OIDC", oauth: "OAuth", local: "Local", ldap: "LDAP", basico: "Básico", nenhum: "Nenhum", nenhuma: "Nenhuma",
  // perfis
  funcional: "Funcional", tecnico: "Técnico", privilegiado: "Privilegiado", quarentena: "Quarentena", cancelado: "Cancelado",
  azure: "Azure SSO", entra_app: "Aplicação do Entra", oauth2: "OAuth 2.0", api_key: "Chave de API", scim: "SCIM", webhook: "Webhook", sem_conector: "Sem conector",
  // entidades (auditoria)
  evento_jml: "Evento JML", eventos_jml: "Eventos JML", notificacao: "Notificação", regra: "Regra", iam_queue: "Fila IAM", perfil_atribuicoes: "Atribuição de perfil",
  perfis_acesso: "Perfil de acesso", perfil_acesso: "Perfil de acesso", colab_quarentena: "Quarentena do RH", sync_jobs: "Job de sincronização", profiles: "Usuário do painel",
  user_roles: "Papel de usuário", revisoes: "Revisão", revisao_itens: "Item de revisão", excecoes: "Exceção", aplicacoes: "Aplicação", cargos: "Cargo", areas: "Área",
  empresas: "Empresa", localidades: "Localidade", parametros: "Parâmetro", alertas: "Alerta", auditoria: "Auditoria", sod_conflitos: "Conflito SoD",
  entra_role_members: "Membro de role", contas_admin_conhecidas: "Conta admin conhecida", sharepoint_sites: "Site SharePoint", integracoes: "Integração",
  // papéis
  platform_admin: "Platform admin", admin: "Administrador", operador: "Operador", viewer: "Leitura",
  // jobs
  daily_cycle: "Ciclo diário", reconcile_identities: "Reconciliação", sync_user_access: "Acesso real (Entra)", sync_entra_apps: "Apps do Entra",
  sync_entra_roles: "Roles do Entra", sync_entra_licencas: "Licenças do Entra",
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Converte um valor técnico em rótulo: dicionário → snake_case limpo → inicial
 * maiúscula. Prefixos com `:` (ex.: `revisao:<id>`, `individual:joao@x`) viram
 * "Revisão" / "Manual (direto) · joao@x".
 */
export function humanize(value?: string | number | null, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const v = String(value).trim();
  if (!v) return fallback;
  const key = v.toLowerCase();
  if (LABELS[key]) return LABELS[key];
  if (v.includes(":") && !/\s/.test(v)) {
    const [prefix, ...rest] = v.split(":");
    const suffix = rest.join(":");
    const head = LABELS[prefix.toLowerCase()] ?? cap(prefix.replace(/[_-]+/g, " "));
    if (!suffix || UUID.test(suffix)) return prefix.toLowerCase() === "revisao" ? "Campanha de revisão" : head;
    return `${head} · ${suffix}`;
  }
  if (v.includes("@")) return v; // e-mail: fica como está
  const cleaned = v.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cap(cleaned);
}

/** Só garante a inicial maiúscula (para textos já humanos). */
export function capitalize(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  return cap(String(value).trim());
}
