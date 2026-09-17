import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AppWindow, ArrowUpRight, Bot, Briefcase, CheckCircle2, ClipboardCheck, Clock, Key, Loader2, Settings, Shield,
  UserCheck, UserMinus, UserPlus, Users, XCircle, AlertTriangle, ScrollText, Upload, Pencil, Trash2, RefreshCw, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { actionLabel, QUEUE_STATUS_META, statusLabel, JML_TIPO_META } from "@/lib/queueLabels";
import { humanize } from "@/lib/labels";
import { tempoRelativo } from "@/lib/alertLabels";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  fonte: "fila" | "jml" | "auditoria";
  id: string;
  ts: string;
  categoria: "pessoa" | "acesso" | "catalogo" | "sistema";
  acao: string;
  pessoa: string | null;
  pessoa_tipo: string | null;
  recurso: string | null;
  status: string | null;
  ator: string | null;
  origem: string | null;
  detalhe: string | null;
  link: string | null;
}

const CATEGORIAS: { value: string; label: string }[] = [
  { value: "", label: "Tudo" }, { value: "pessoa", label: "Pessoas" }, { value: "acesso", label: "Acessos" }, { value: "catalogo", label: "Catálogo" }, { value: "sistema", label: "Sistema" },
];

/** Feed unificado (auditoria + fila + eventos JML) — RPC dashboard_activity; tempo real via prefixo "dashboard". */
export function useActivityFeed(limit: number, categoria: string, colaboradorId?: string, terceiroId?: string) {
  return useQuery({
    queryKey: ["dashboard_activity", limit, categoria, colaboradorId ?? null, terceiroId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_activity", { p_limit: limit, p_categoria: categoria || null, p_colaborador_id: colaboradorId ?? null, p_terceiro_id: terceiroId ?? null });
      if (error) throw error;
      return (data ?? []) as unknown as ActivityItem[];
    },
    staleTime: 15_000,
  });
}

/** Rótulo humano da ação de auditoria (verbo_entidade → frase) */
const ACAO_LABELS: Record<string, string> = {
  criar_colaborador: "Colaborador criado", editar_colaborador: "Colaborador editado", alterar_status_colaborador: "Status de colaborador alterado",
  purgar_colaboradores: "Colaboradores purgados", suspender_preventivo: "Suspensão preventiva", reverter_suspensao_preventiva: "Suspensão revertida",
  criar_terceiro: "Terceiro criado", editar_terceiro: "Terceiro editado", desligar_terceiro: "Terceiro desligado", reativar_terceiro: "Terceiro reativado",
  revalidar_terceiro: "Terceiro revalidado", delete_convertido_em_desligamento: "Exclusão convertida em desligamento",
  atribuir_perfil: "Perfil atribuído", revogar_perfil: "Perfil revogado", atribuir_perfil_terceiro: "Perfil atribuído a terceiro", revogar_perfil_terceiro: "Perfil revogado de terceiro",
  atribuir_grupo_individual: "Grupo concedido (direto)", atribuir_licenca_individual: "Licença concedida (direta)", atribuir_app_individual: "Aplicação concedida (direta)",
  atribuir_sharepoint_individual: "SharePoint concedido (direto)", revogar_individual: "Acesso direto revogado",
  aprovar_excecao: "Exceção aprovada", rejeitar_excecao: "Exceção rejeitada", expirar_excecao: "Exceção expirada", bloquear_desativacao_excecao: "Desativação bloqueada por exceção",
  criar_revisao: "Campanha de revisão criada", concluir_revisao: "Revisão concluída", cancelar_revisao: "Revisão cancelada", email_revisao: "E-mail de revisão",
  decidir_iam_queue: "Decisão na fila", reprocessar_falhas: "Falhas reprocessadas", reset_senha_solicitado: "Reset de senha solicitado", reset_senha_negado: "Reset de senha negado",
  jml_joiner_iniciado: "Joiner iniciado", jml_mover_iniciado: "Mover iniciado", jml_leaver_iniciado: "Leaver iniciado", jml_pre_leaver_iniciado: "Pré-leaver iniciado", jml_mover: "Mover executado",
  iniciar_evento_jml: "Evento JML iniciado", importar: "Base do RH importada", sync: "Sincronização", executar: "Execução", auditar_amostragem: "Auditoria por amostragem",
  quarentena_resolvido: "Quarentena resolvida", quarentena_descartado: "Quarentena descartada", revalidacao_solicitada: "Revalidação solicitada",
  criar_aplicacao: "Aplicação criada", editar_aplicacao: "Aplicação editada", excluir_aplicacao: "Aplicação excluída",
  criar_perfil: "Perfil criado", editar_perfil: "Perfil editado", excluir_perfil: "Perfil excluído",
  criar_cargo: "Cargo criado", editar_cargo: "Cargo editado", excluir_cargo: "Cargo excluído", criar_area: "Área criada", editar_area: "Área editada", excluir_area: "Área excluída",
  criar_empresa: "Empresa criada", editar_empresa: "Empresa editada", excluir_empresa: "Empresa excluída", criar_localidade: "Localidade criada", editar_localidade: "Localidade editada", excluir_localidade: "Localidade excluída",
  criar_licenca: "Licença criada", editar_licenca: "Licença editada", excluir_licenca: "Licença excluída",
  criar_usuario: "Usuário do painel criado", editar_usuario: "Usuário do painel editado", desativar_usuario: "Usuário do painel desativado",
  admin_exec_sql: "SQL administrativo", admin_exec_ddl: "DDL administrativo", invoke_edge_function: "Função executada (Hermes)", request_access_mcp: "Pedido de acesso (Hermes)",
  limpeza_dados_demo: "Limpeza de dados de demonstração", cron_invoke: "Job agendado", enviar_email: "E-mail enviado",
};

function acaoIcon(item: ActivityItem): { icon: LucideIcon; tone: string } {
  const a = item.acao || "";
  if (item.fonte === "fila") {
    if (item.status === "success") return { icon: CheckCircle2, tone: "bg-success/10 text-success" };
    if (item.status === "failed") return { icon: XCircle, tone: "bg-destructive/10 text-destructive" };
    if (item.status === "processing") return { icon: Loader2, tone: "bg-info/10 text-info" };
    if (item.status === "waiting_approval") return { icon: Clock, tone: "bg-warning/10 text-warning" };
    if (item.status === "cancelled" || item.status === "rejected") return { icon: XCircle, tone: "bg-muted text-muted-foreground" };
    return { icon: Bot, tone: "bg-primary/10 text-primary" };
  }
  if (item.fonte === "jml") {
    const t = a.replace("jml_", "");
    return { icon: t === "joiner" ? UserPlus : t === "leaver" ? UserMinus : t === "mover" ? RefreshCw : Activity, tone: t === "leaver" ? "bg-destructive/10 text-destructive" : t === "joiner" ? "bg-success/10 text-success" : "bg-info/10 text-info" };
  }
  if (/^(criar|atribuir)/.test(a)) return { icon: a.includes("perfil") || a.includes("individual") ? Shield : UserPlus, tone: "bg-success/10 text-success" };
  if (/^(excluir|revogar|desligar|purgar|rejeitar|desativar)/.test(a)) return { icon: a.includes("perfil") ? Shield : a.startsWith("excluir") ? Trash2 : UserMinus, tone: "bg-destructive/10 text-destructive" };
  if (/^editar|^alterar/.test(a)) return { icon: Pencil, tone: "bg-info/10 text-info" };
  if (a.includes("revisao")) return { icon: ClipboardCheck, tone: "bg-primary/10 text-primary" };
  if (a.includes("excecao")) return { icon: AlertTriangle, tone: "bg-warning/10 text-warning" };
  if (a.includes("terceiro")) return { icon: UserCheck, tone: "bg-info/10 text-info" };
  if (a.includes("importar") || a.includes("quarentena")) return { icon: Upload, tone: "bg-info/10 text-info" };
  if (a.includes("aplicacao")) return { icon: AppWindow, tone: "bg-muted text-muted-foreground" };
  if (a.includes("licenca")) return { icon: Key, tone: "bg-muted text-muted-foreground" };
  if (a.includes("cargo") || a.includes("area") || a.includes("empresa") || a.includes("localidade")) return { icon: Briefcase, tone: "bg-muted text-muted-foreground" };
  if (a.includes("usuario")) return { icon: Users, tone: "bg-muted text-muted-foreground" };
  if (a.startsWith("admin") || a.includes("cron") || a.includes("sql")) return { icon: Settings, tone: "bg-muted text-muted-foreground" };
  return { icon: ScrollText, tone: "bg-muted text-muted-foreground" };
}

function titulo(item: ActivityItem): string {
  if (item.fonte === "fila") return `${actionLabel(item.acao)}${item.recurso ? `: ${item.recurso}` : ""}`;
  if (item.fonte === "jml") return `${JML_TIPO_META[item.acao.replace("jml_", "")]?.label ?? humanize(item.acao.replace("jml_", ""))} — ${humanize(item.status)}`;
  return ACAO_LABELS[item.acao] ?? humanize(item.acao);
}

function ator(item: ActivityItem): string {
  const a = item.ator || "sistema";
  if (a.startsWith("revisao:")) return "Campanha de revisão";
  if (a.includes("@")) return a;
  return humanize(a);
}

export default function ActivityFeed({ limit = 12, showFilters = true, className, colaboradorId, terceiroId, emptyMessage }: { limit?: number; showFilters?: boolean; className?: string; colaboradorId?: string; terceiroId?: string; emptyMessage?: string }) {
  const [categoria, setCategoria] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useActivityFeed(expanded ? Math.min(limit * 4, 200) : limit, categoria, colaboradorId, terceiroId);
  const pessoaFixa = !!(colaboradorId || terceiroId);
  const items = data ?? [];

  return (
    <div className={className}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
          {CATEGORIAS.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategoria(c.value)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", categoria === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{c.label}</button>
          ))}
        </div>
      )}
      {isLoading ? (
        <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState message={emptyMessage ?? "Nenhuma atividade registrada ainda."} size="lg" />
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const { icon: Icon, tone } = acaoIcon(item);
            const inner = (
              <>
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}><Icon className={cn("h-4 w-4", item.status === "processing" && "animate-spin")} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-[13px] font-medium">{item.pessoa && !pessoaFixa ? <>{item.pessoa}<span className="text-muted-foreground"> · </span></> : null}{titulo(item)}</span>
                    {item.pessoa_tipo && !pessoaFixa && <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">{item.pessoa_tipo === "terceiro" || item.pessoa_tipo === "terceiros" ? "Terceiro" : "Colaborador"}</Badge>}
                    {item.fonte === "fila" && item.status && <Badge variant="outline" className={cn("h-4 px-1.5 text-[9px]", QUEUE_STATUS_META[item.status]?.className)}>{statusLabel(item.status)}</Badge>}
                  </span>
                  {item.detalhe && item.fonte !== "jml" && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{item.detalhe}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/70">{ator(item)}{item.fonte === "fila" && item.origem && item.origem !== item.ator ? ` · ${humanize(item.origem)}` : ""} · <span title={new Date(item.ts).toLocaleString("pt-BR")}>{tempoRelativo(item.ts)}</span></span>
                </span>
                {item.link && <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />}
              </>
            );
            return (
              <li key={`${item.fonte}-${item.id}`}>
                {item.link ? <Link to={item.link} className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">{inner}</Link> : <div className="flex items-start gap-3 px-4 py-2.5">{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {!isLoading && items.length >= limit && (
        <div className="border-t px-3 py-1.5 text-center">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((e) => !e)}>{expanded ? "Mostrar menos" : "Mostrar mais"}</Button>
        </div>
      )}
    </div>
  );
}
