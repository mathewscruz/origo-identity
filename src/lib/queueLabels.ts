import { humanize } from "@/lib/labels";

/**
 * Rótulos e cores únicos para a fila IAM e eventos JML (antes cada tela tinha a
 * sua cópia, com vocabulários diferentes).
 */

export const QUEUE_ACTION_LABELS: Record<string, string> = {
  create: "Criar conta (AD)",
  create_if_not_exists: "Criar conta (AD, se não existir)",
  update: "Atualizar atributos (AD)",
  disable: "Desabilitar conta (AD)",
  delete: "Excluir conta (AD)",
  reset_password: "Resetar senha",
  disable_entra: "Desabilitar conta (Entra)",
  enable_entra: "Reabilitar conta (Entra)",
  update_entra: "Atualizar atributos (Entra)",
  assign_group: "Adicionar em grupo",
  remove_group: "Remover de grupo",
  assign_license: "Atribuir licença",
  remove_license: "Remover licença",
  assign_app: "Atribuir aplicação",
  remove_app: "Remover aplicação",
  assign_sharepoint: "Conceder SharePoint",
  remove_sharepoint: "Remover SharePoint",
  create_user_app: "Criar em app externo",
  update_user_app: "Atualizar em app externo",
  disable_user_app: "Desabilitar em app externo",
  delete_user_app: "Excluir em app externo",
  review_orphan_entra: "Revisar conta órfã (Entra)",
};

export function actionLabel(action: string): string {
  return QUEUE_ACTION_LABELS[action] || humanize(action);
}

/** classes de badge por tipo de ação */
export function actionBadgeClass(action: string): string {
  if (action.startsWith("disable") || action.startsWith("remove") || action.startsWith("delete")) return "bg-destructive/10 text-destructive border-destructive/30";
  if (action.startsWith("enable") || action.startsWith("create") || action.startsWith("assign")) return "bg-success/10 text-success border-success/30";
  if (action === "review_orphan_entra") return "bg-warning/10 text-warning border-warning/30";
  if (action === "reset_password") return "bg-violet-500/10 text-violet-700 border-violet-500/30";
  return "bg-info/10 text-info border-info/30";
}

/** sistema-alvo de uma ação */
export function actionScope(action: string): "AD" | "Entra" | "SharePoint" | "App externo" | "IAM" {
  if (action === "review_orphan_entra") return "IAM";
  if (action.endsWith("_user_app")) return "App externo";
  if (action.includes("sharepoint")) return "SharePoint";
  if (["create", "create_if_not_exists", "update", "disable", "delete", "reset_password"].includes(action)) return "AD";
  if (action.includes("entra") || action.startsWith("assign_") || action.startsWith("remove_")) return "Entra";
  return "IAM";
}

export const QUEUE_STATUS_META: Record<string, { label: string; className: string }> = {
  waiting_approval: { label: "Aguardando aprovação", className: "bg-info/15 text-info border-info/30" },
  pending: { label: "Pendente (agente)", className: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Executando", className: "bg-violet-500/15 text-violet-700 border-violet-500/30" },
  success: { label: "Concluído", className: "bg-success/15 text-success border-success/30" },
  failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
  rejected: { label: "Recusado", className: "bg-muted text-muted-foreground border-border" },
};

export function statusLabel(status: string): string {
  return QUEUE_STATUS_META[status]?.label || humanize(status);
}

export const QUEUE_OPEN_STATUSES = ["waiting_approval", "pending", "processing"];

export const JML_TIPO_META: Record<string, { label: string; className: string }> = {
  joiner: { label: "Joiner", className: "bg-success text-success-foreground" },
  mover: { label: "Mover", className: "bg-info text-info-foreground" },
  leaver: { label: "Leaver", className: "bg-destructive text-destructive-foreground" },
  pre_leaver: { label: "Pré-leaver", className: "bg-warning text-warning-foreground" },
  pre_leaver_revertido: { label: "Pré-leaver revertido", className: "bg-muted text-muted-foreground" },
};

export const JML_ORIGEM_LABELS: Record<string, string> = {
  manual: "Manual",
  importacao_csv: "Base do RH",
  importacao: "Base do RH",
  reconciliacao: "Reconciliação",
  auto_expiracao: "Expiração automática",
  mcp_hermes: "Hermes (GLPI)",
  csv: "Base do RH",
};

export const COLAB_STATUS_META: Record<string, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", className: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", className: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", className: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", className: "bg-destructive/15 text-destructive border-destructive/30" },
};
