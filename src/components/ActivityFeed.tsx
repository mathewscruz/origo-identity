import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AppWindow, ArrowUpRight, Briefcase, CheckCircle2, ClipboardCheck, Clock, Key, Loader2, Settings, Shield,
  UserCheck, UserMinus, UserPlus, Users, XCircle, AlertTriangle, ScrollText, Upload, Pencil, Trash2, RefreshCw,
  IdCard, Ticket, ShieldAlert, ShieldPlus, ShieldMinus, ToggleRight, ArrowLeftRight, Link2, LockKeyhole, CloudUpload,
  Gavel, RotateCcw, Terminal,
} from "lucide-react";
import HermesIcon from "@/components/icons/HermesIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { actionLabel, QUEUE_STATUS_META, statusLabel, JML_TIPO_META } from "@/lib/queueLabels";
import { humanize } from "@/lib/labels";
import { tempoRelativo } from "@/lib/alertLabels";
import { cn } from "@/lib/utils";
import { activitySentence, isActivityNoise, isHermesActor } from "@/lib/activityLabels";
import { resolveActivityNames } from "@/lib/activityNames";

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
  { value: "rh", label: "RH" },
  { value: "", label: "Tudo" }, { value: "pessoa", label: "Pessoas" }, { value: "acesso", label: "Acessos" }, { value: "catalogo", label: "Catálogo" }, { value: "sistema", label: "Sistema" },
];

/** Feed unificado (auditoria + fila + eventos JML) — RPC dashboard_activity; tempo real via prefixo "dashboard". */
export function useActivityFeed(limit: number, categoria: string, colaboradorId?: string, terceiroId?: string) {
  return useQuery({
    queryKey: ["dashboard_activity", limit, categoria, colaboradorId ?? null, terceiroId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_activity", { p_limit: limit, p_categoria: categoria || null, p_colaborador_id: colaboradorId ?? null, p_terceiro_id: terceiroId ?? null });
      if (error) throw error;
      const items = (data ?? []) as unknown as ActivityItem[];
      const names = [...new Set(items.flatMap(item => item.pessoa?.includes("\uFFFD") ? [item.pessoa] : []))];
      if (names.length === 0) return items;
      const { data: references, error: referenceError } = await supabase.rpc("activity_name_references", { p_names: names });
      // A reference failure must not hide the original activity or guess a person's name.
      if (referenceError) return items;
      return resolveActivityNames(items, references ?? []);
    },
    staleTime: 15_000,
  });
}

/** Rótulo humano da ação de auditoria (verbo_entidade → frase) */
const ACAO_LABELS: Record<string, string> = {
  rh_desligamento: "Desligamento RH — bloqueio de acessos",
  rh_entrada: "Entrada RH — provisionamento",
  rh_desligamento_escopo14: "Desligamento RH — bloqueio de acessos",
  rh_desligamento_cloud_verificado: "Desligamento RH — verificação na nuvem",
  rh_cadastral_incremental: "Atualização cadastral RH",
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

type IconTone = { icon: ComponentType<{ className?: string }>; tone: string };
const T = {
  ok: "bg-success/10 text-success", bad: "bg-destructive/10 text-destructive", warn: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info", brand: "bg-primary/10 text-primary", mute: "bg-muted text-muted-foreground",
};

/** Ícone próprio por ação exata; regras por prefixo ficam como reserva. */
export const ACAO_ICON: Record<string, IconTone> = {
  criar_usuario: { icon: UserPlus, tone: T.ok },
  glpi_joiner_iam_created: { icon: UserPlus, tone: T.ok },
  telegram_joiner_iam_created: { icon: UserPlus, tone: T.ok },
  terceiro_cadastro_criado: { icon: IdCard, tone: T.ok },
  criar_terceiro_glpi: { icon: IdCard, tone: T.ok },
  criar_terceiro_glpi_lote: { icon: IdCard, tone: T.ok },
  criar_terceiro_glpi_lote_manual: { icon: IdCard, tone: T.ok },
  criar_terceiro_glpi_alias_aprovado: { icon: IdCard, tone: T.ok },
  finalizar_onboarding_terceiro_glpi: { icon: IdCard, tone: T.ok },
  corrigir_nome_civil_terceiro: { icon: Pencil, tone: T.info },
  glpi_access_ticket_auto_processed: { icon: Ticket, tone: T.brand },
  desligamento_completo_telegram: { icon: UserMinus, tone: T.bad },
  jml_leaver_iniciado: { icon: UserMinus, tone: T.bad },
  bloquear_desligamento_por_ausencia_csv: { icon: ShieldAlert, tone: T.warn },
  corrigir_falso_desligamento_csv: { icon: ShieldAlert, tone: T.warn },
  alterar_status_colaborador: { icon: ToggleRight, tone: T.info },
  jml_mover: { icon: ArrowLeftRight, tone: T.info },
  iniciar_evento_jml: { icon: Activity, tone: T.info },
  atribuir_perfil: { icon: ShieldPlus, tone: T.ok },
  revogar_perfil: { icon: ShieldMinus, tone: T.bad },
  mapear_cargo_perfil: { icon: Link2, tone: T.info },
  provisionar_pos_replicacao_entra: { icon: Users, tone: T.info },
  resetar_senha: { icon: LockKeyhole, tone: T.warn },
  reset_senha_solicitado: { icon: LockKeyhole, tone: T.warn },
  criar_revisao: { icon: ClipboardCheck, tone: T.brand },
  excluir_revisao: { icon: ClipboardCheck, tone: T.bad },
  email_revisao: { icon: ClipboardCheck, tone: T.brand },
  importar: { icon: CloudUpload, tone: T.info },
  equalizar_status_rh: { icon: CloudUpload, tone: T.info },
  sync: { icon: RefreshCw, tone: T.info },
  decidir_iam_queue: { icon: Gavel, tone: T.ok },
  recusar: { icon: XCircle, tone: T.bad },
  reprocessar_falhas: { icon: RotateCcw, tone: T.info },
  iam_failed_backlog_reconciled: { icon: RotateCcw, tone: T.info },
  admin_exec_sql: { icon: Terminal, tone: T.mute },
  admin_exec_ddl: { icon: Terminal, tone: T.mute },
  invoke_edge_function: { icon: Terminal, tone: T.mute },
  excluir_usuario: { icon: Trash2, tone: T.bad },
  excluir_aplicacao: { icon: AppWindow, tone: T.bad },
  editar_cargo: { icon: Pencil, tone: T.info },
};

function recursoIcon(a: string): ComponentType<{ className?: string }> {
  if (a.includes("licen")) return Key;
  if (a.includes("group") || a.includes("grupo")) return Users;
  if (a.includes("app")) return AppWindow;
  if (a.includes("password") || a.includes("senha")) return LockKeyhole;
  if (a.includes("disable") || a.includes("leaver")) return UserMinus;
  if (a.includes("create") || a.includes("criar")) return UserPlus;
  return CheckCircle2;
}

export function acaoIcon(item: ActivityItem): IconTone {
  const a = item.acao || "";
  if (item.origem === "rh") {
    if (item.status === "partial") return { icon: AlertTriangle, tone: T.warn };
    if (item.status === "failed") return { icon: XCircle, tone: T.bad };
    if (item.status === "pending") return { icon: Clock, tone: T.warn };
    return { icon: a === "rh_cadastral_incremental" ? Pencil : a === "rh_entrada" ? UserPlus : UserMinus, tone: T.info };
  }
  if (item.fonte === "fila") {
    if (item.status === "success") return { icon: recursoIcon(a.toLowerCase()), tone: T.ok };
    if (item.status === "failed") return { icon: XCircle, tone: T.bad };
    if (item.status === "processing") return { icon: Loader2, tone: T.info };
    if (item.status === "waiting_approval") return { icon: Clock, tone: T.warn };
    if (item.status === "cancelled" || item.status === "rejected") return { icon: XCircle, tone: T.mute };
    return { icon: HermesIcon, tone: T.brand };
  }
  if (item.fonte === "jml") {
    const t = a.replace("jml_", "");
    return { icon: t === "joiner" ? UserPlus : t === "leaver" ? UserMinus : t === "mover" ? ArrowLeftRight : Activity, tone: t === "leaver" ? T.bad : t === "joiner" ? T.ok : T.info };
  }
  if (ACAO_ICON[a]) return ACAO_ICON[a];
  if (a.includes("excecao")) return { icon: AlertTriangle, tone: T.warn };
  if (a.includes("revisao")) return { icon: ClipboardCheck, tone: T.brand };
  if (a.includes("aplicacao")) return { icon: AppWindow, tone: /^excluir/.test(a) ? T.bad : T.info };
  if (a.includes("licenca")) return { icon: Key, tone: T.info };
  if (a.includes("grupo")) return { icon: Users, tone: T.info };
  if (a.includes("senha")) return { icon: LockKeyhole, tone: T.warn };
  if (/^(criar|atribuir)/.test(a)) return { icon: a.includes("perfil") ? ShieldPlus : a.includes("terceiro") ? IdCard : UserPlus, tone: T.ok };
  if (/^(excluir|revogar|desligar|purgar|rejeitar|desativar)/.test(a)) return { icon: a.includes("perfil") ? ShieldMinus : a.startsWith("excluir") ? Trash2 : UserMinus, tone: T.bad };
  if (/^editar|^alterar/.test(a)) return { icon: Pencil, tone: T.info };
  if (a.includes("terceiro")) return { icon: IdCard, tone: T.info };
  if (a.includes("importar") || a.includes("quarentena")) return { icon: Upload, tone: T.info };
  if (a.includes("cargo") || a.includes("area") || a.includes("empresa") || a.includes("localidade")) return { icon: Briefcase, tone: T.mute };
  if (a.includes("usuario")) return { icon: Users, tone: T.mute };
  if (a.startsWith("admin") || a.includes("cron") || a.includes("sql")) return { icon: Terminal, tone: T.mute };
  if (isHermesActor(item.ator)) return { icon: HermesIcon, tone: T.brand };
  return { icon: ScrollText, tone: T.mute };
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
  const { data, isLoading, error, refetch, isPlaceholderData } = useActivityFeed(expanded ? Math.min(limit * 4, 200) : limit, categoria, colaboradorId, terceiroId);
  const pessoaFixa = !!(colaboradorId || terceiroId);
  // Only dedupe the same immutable record; never merge different people/actions.
  const unique = Array.from(new Map((data ?? []).map((item) => [`${item.fonte}:${item.id}`, item])).values()).filter((i) => !isActivityNoise(i));
  // Agrupa itens consecutivos da fila com a mesma pessoa, ação e situação ("+N semelhantes").
  const items: (ActivityItem & { extra: number; recursos: string[] })[] = [];
  for (const it of unique) {
    const last = items[items.length - 1];
    if (last && it.fonte === "fila" && last.fonte === "fila" && last.pessoa === it.pessoa && last.acao === it.acao && last.status === it.status) {
      last.extra += 1; if (it.recurso) last.recursos.push(it.recurso); continue;
    }
    items.push({ ...it, extra: 0, recursos: it.recurso ? [it.recurso] : [] });
  }

  return (
    <div className={className}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
          {CATEGORIAS.map((c) => (
            <button key={c.value} type="button" aria-pressed={categoria === c.value} onClick={() => { setCategoria(c.value); setExpanded(false); }} className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", categoria === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{c.label}</button>
          ))}
        </div>
      )}
      {error ? <div role="alert" className="p-4 text-sm text-destructive">Não foi possível carregar a atividade. <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div> : isLoading || isPlaceholderData ? (
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
                    <span className="break-words text-[13px] font-medium">{activitySentence(item) || <>{item.pessoa && !pessoaFixa ? <>{item.pessoa}<span className="text-muted-foreground"> · </span></> : null}{titulo(item)}</>}</span>
                    {item.extra > 0 && <Badge variant="secondary" className="px-1.5 text-[10px]" title={item.recursos.join(", ")}>+{item.extra} semelhante{item.extra > 1 ? "s" : ""}</Badge>}
                    {item.pessoa_tipo && !pessoaFixa && <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">{item.pessoa_tipo === "terceiro" || item.pessoa_tipo === "terceiros" ? "Terceiro" : "Colaborador"}</Badge>}
                    {item.status && <Badge variant="outline" className={cn("px-1.5 text-[10px]", QUEUE_STATUS_META[item.status]?.className, item.status === "partial" && "border-warning/30 text-warning")}>{item.fonte === "fila" ? statusLabel(item.status) : humanize(item.status)}</Badge>}
                  </span>
                  {item.detalhe && <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground">{item.detalhe}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{ator(item)} · <span title={new Date(item.ts).toLocaleString("pt-BR")}>{tempoRelativo(item.ts)}</span></span>
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
      {!error && !isLoading && !isPlaceholderData && (expanded || (data?.length ?? 0) >= limit) && (
        <div className="border-t px-3 py-1.5 text-center">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((e) => !e)}>{expanded ? "Mostrar menos" : "Mostrar mais"}</Button>
        </div>
      )}
    </div>
  );
}
