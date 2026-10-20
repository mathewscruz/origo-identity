/** Frases de negócio para a atividade recente ("quem · o quê · em quem"). */
export interface ActivityLike {
  fonte: "fila" | "jml" | "auditoria";
  acao: string;
  pessoa: string | null;
  recurso: string | null;
  status: string | null;
  detalhe?: string | null;
}

const P = (p: string | null) => (p && p !== "—" ? p : "pessoa sem nome");
const R = (r: string | null, fallback: string) => (r ? r : fallback);

/** Ação concluída da fila, no passado. */
const FILA_DONE: Record<string, (p: string, r: string | null) => string> = {
  create: (p) => `Criou o usuário ${p} no AD`,
  create_if_not_exists: (p) => `Criou o usuário ${p} no AD`,
  update: (p) => `Atualizou os dados de ${p} no AD`,
  update_ad_attributes: (p) => `Atualizou os dados de ${p} no AD`,
  disable: (p) => `Desabilitou a conta de ${p} no AD`,
  disable_ad: (p) => `Desabilitou a conta de ${p} no AD`,
  delete: (p) => `Excluiu a conta de ${p} no AD`,
  reset_password: (p) => `Redefiniu a senha de ${p}`,
  disable_entra: (p) => `Desabilitou a conta de ${p} no Entra`,
  enable_entra: (p) => `Reabilitou a conta de ${p} no Entra`,
  update_entra: (p) => `Atualizou os dados de ${p} no Entra`,
  assign_group: (p, r) => `Adicionou ${p} ao grupo ${R(r, "")}`.trim(),
  add_group: (p, r) => `Adicionou ${p} ao grupo ${R(r, "")}`.trim(),
  remove_group: (p, r) => `Removeu ${p} do grupo ${R(r, "")}`.trim(),
  assign_license: (p, r) => `Deu a licença ${R(r, "")} para ${p}`.replace("  ", " "),
  remove_license: (p, r) => `Tirou a licença ${R(r, "")} de ${p}`.replace("  ", " "),
  assign_app: (p, r) => `Liberou o aplicativo ${R(r, "")} para ${p}`.replace("  ", " "),
  remove_app: (p, r) => `Retirou o aplicativo ${R(r, "")} de ${p}`.replace("  ", " "),
  assign_sharepoint: (p, r) => `Liberou o SharePoint ${R(r, "")} para ${p}`.replace("  ", " "),
  remove_sharepoint: (p, r) => `Retirou o SharePoint ${R(r, "")} de ${p}`.replace("  ", " "),
  create_user_app: (p, r) => `Criou ${p} no aplicativo ${R(r, "externo")}`,
  update_user_app: (p, r) => `Atualizou ${p} no aplicativo ${R(r, "externo")}`,
  disable_user_app: (p, r) => `Desabilitou ${p} no aplicativo ${R(r, "externo")}`,
  delete_user_app: (p, r) => `Excluiu ${p} do aplicativo ${R(r, "externo")}`,
  review_orphan_entra: (p) => `Conta órfã de ${p} no Entra revisada`,
};

/** Substantivo da ação para estados não concluídos. */
const FILA_NOUN: Record<string, string> = {
  create: "Criar usuário", create_if_not_exists: "Criar usuário", update: "Atualizar dados", disable: "Desabilitar conta",
  reset_password: "Redefinir senha", disable_entra: "Desabilitar conta no Entra", enable_entra: "Reabilitar conta no Entra",
  update_entra: "Atualizar dados no Entra", assign_group: "Adicionar ao grupo", add_group: "Adicionar ao grupo", remove_group: "Remover do grupo",
  assign_license: "Dar licença", remove_license: "Tirar licença", assign_app: "Liberar aplicativo", remove_app: "Retirar aplicativo",
  assign_sharepoint: "Liberar SharePoint", remove_sharepoint: "Retirar SharePoint", review_orphan_entra: "Revisar conta órfã",
};

const JML: Record<string, (p: string) => string> = {
  joiner: (p) => `Admissão de ${p}`,
  mover: (p) => `Mudança de cargo de ${p}`,
  leaver: (p) => `Desligamento de ${p}`,
  pre_leaver: (p) => `Suspensão preventiva de ${p}`,
  pre_leaver_revertido: (p) => `Suspensão de ${p} revertida`,
};

const AUD: Record<string, (p: string | null) => string> = {
  criar_colaborador: (p) => `Cadastrou ${P(p)}`,
  editar_colaborador: (p) => `Editou o cadastro de ${P(p)}`,
  alterar_status_colaborador: (p) => `Alterou a situação de ${P(p)}`,
  suspender_preventivo: (p) => `Suspendeu preventivamente ${P(p)}`,
  reverter_suspensao_preventiva: (p) => `Reverteu a suspensão de ${P(p)}`,
  criar_terceiro: (p) => `Cadastrou o terceiro ${P(p)}`,
  desligar_terceiro: (p) => `Desligou o terceiro ${P(p)}`,
  reativar_terceiro: (p) => `Reativou o terceiro ${P(p)}`,
  revalidar_terceiro: (p) => `Revalidou o acesso do terceiro ${P(p)}`,
  atribuir_perfil: (p) => `Deu um perfil de acesso para ${P(p)}`,
  revogar_perfil: (p) => `Tirou um perfil de acesso de ${P(p)}`,
  revogar_individual: (p) => `Retirou um acesso direto de ${P(p)}`,
  aprovar_excecao: (p) => `Aprovou exceção de acesso${p ? ` para ${p}` : ""}`,
  rejeitar_excecao: (p) => `Rejeitou exceção de acesso${p ? ` de ${p}` : ""}`,
  expirar_excecao: (p) => `Exceção de acesso${p ? ` de ${p}` : ""} expirou`,
  rh_entrada: (p) => `RH: entrada de ${P(p)}`,
  rh_desligamento: (p) => `RH: desligamento de ${P(p)}`,
  rh_desligamento_escopo14: (p) => `RH: desligamento de ${P(p)}`,
  rh_cadastral_incremental: (p) => `RH: dados de ${P(p)} atualizados`,
  importar: () => "Importou a base do RH",
  quarentena_triagem: () => "Hermes revisou a quarentena do RH",
  quarentena_resolvido: (p) => `Resolveu pendência do RH${p ? ` de ${p}` : ""}`,
  quarentena_descartado: (p) => `Descartou pendência do RH${p ? ` de ${p}` : ""}`,
  criar_revisao: () => "Abriu uma campanha de revisão de acessos",
  concluir_revisao: () => "Concluiu uma revisão de acessos",
  reset_senha_solicitado: (p) => `Pediu a redefinição de senha de ${P(p)}`,
  criar_aplicacao: () => "Cadastrou uma aplicação", criar_perfil: () => "Criou um perfil de acesso", editar_perfil: () => "Editou um perfil de acesso",
  criar_usuario: () => "Criou um usuário do painel",
};

/** Ações técnicas que não aparecem na atividade recente (ficam só na Auditoria). */
const NOISE = /^(admin_exec_sql|admin_exec_ddl|cron_invoke|agent_task|agent_task_solicitada|invoke_edge_function|heartbeat|limpeza_dados_demo)$/;

export function isActivityNoise(item: Pick<ActivityLike, "fonte" | "acao">): boolean {
  return item.fonte === "auditoria" && NOISE.test(item.acao || "");
}

export function activitySentence(item: ActivityLike): string {
  const p = P(item.pessoa);
  if (item.fonte === "fila") {
    const done = FILA_DONE[item.acao];
    const noun = FILA_NOUN[item.acao] ?? item.acao.replace(/_/g, " ");
    const tail = `${item.recurso ? ` ${item.recurso}` : ""} — ${p}`;
    switch (item.status) {
      case "success": return done ? done(p, item.recurso) : `${noun}${tail}`;
      case "failed": return `Falhou: ${noun.toLowerCase()}${tail}`;
      case "waiting_approval": return `Aguardando aprovação: ${noun.toLowerCase()}${tail}`;
      case "rejected": return `Recusado: ${noun.toLowerCase()}${tail}`;
      case "cancelled": return `Nada a fazer: ${noun.toLowerCase()}${tail}`;
      default: return `Em andamento: ${noun.toLowerCase()}${tail}`;
    }
  }
  if (item.fonte === "jml") {
    const t = item.acao.replace(/^jml_/, "");
    const base = (JML[t] ?? ((x: string) => `Evento de ${x}`))(p);
    if (item.status === "executado") return `${base} concluída`;
    if (item.status === "erro") return `${base} com erro`;
    if (item.status === "cancelado") return `${base} cancelada`;
    return `${base} em andamento`;
  }
  const fn = AUD[item.acao];
  return fn ? fn(item.pessoa) : "";
}
