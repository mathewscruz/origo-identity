import {
  AlertTriangle, Info, ShieldAlert, ClipboardCheck, UserCheck, Activity, Upload, Key, CheckSquare, Bot, Crown, UserX, Clock, type LucideIcon,
} from "lucide-react";

/** Severidade → rótulo e cores (badge, ponto, fundo). */
export const SEVERIDADE_META: Record<string, { label: string; badge: string; dot: string; icon: LucideIcon }> = {
  critico: { label: "Crítico", badge: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive", icon: ShieldAlert },
  aviso: { label: "Aviso", badge: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning", icon: AlertTriangle },
  info: { label: "Info", badge: "bg-info/15 text-info border-info/30", dot: "bg-info", icon: Info },
};

/** Tipo do alerta → rótulo humano e ícone (o que está acontecendo). */
export const ALERTA_TIPO_META: Record<string, { label: string; icon: LucideIcon }> = {
  recertificacao: { label: "Revisão de acesso", icon: ClipboardCheck },
  revisao_atrasada: { label: "Revisão atrasada", icon: Clock },
  revisao_concluida: { label: "Revisão concluída", icon: ClipboardCheck },
  vencimento_terceiro: { label: "Contrato de terceiro", icon: UserCheck },
  terceiro_expirado: { label: "Terceiro desligado", icon: UserX },
  revalidacao_terceiro: { label: "Revalidação de terceiro", icon: UserCheck },
  evento_jml_erro: { label: "Evento JML com erro", icon: Activity },
  evento_jml: { label: "Evento JML", icon: Activity },
  quarentena: { label: "Quarentena do RH", icon: Upload },
  importacao: { label: "Importação do RH", icon: Upload },
  licenca_critica: { label: "Licença crítica", icon: Key },
  aprovacao_pendente: { label: "Aguardando aprovação", icon: CheckSquare },
  fila_falha: { label: "Falha na fila", icon: Bot },
  agente: { label: "Órigo Agente", icon: Bot },
  agente_offline: { label: "Agente offline", icon: Bot },
  privilegiados: { label: "Contas privilegiadas", icon: Crown },
  role_privilegiada: { label: "Role privilegiada", icon: Crown },
  orfao: { label: "Conta órfã", icon: UserX },
  sod: { label: "Conflito SoD", icon: ShieldAlert },
  excecao: { label: "Exceção de acesso", icon: AlertTriangle },
};

export function alertaTipoLabel(tipo?: string | null) {
  if (!tipo) return "Sistema";
  return ALERTA_TIPO_META[tipo]?.label ?? tipo.replace(/_/g, " ");
}
export function alertaTipoIcon(tipo?: string | null): LucideIcon {
  return (tipo && ALERTA_TIPO_META[tipo]?.icon) || Info;
}

export function tempoRelativo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const dias = Math.floor(hrs / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
