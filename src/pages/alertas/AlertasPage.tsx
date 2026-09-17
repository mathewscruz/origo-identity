import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, ArrowUpRight, Search, Check, Bell, ShieldAlert, AlertTriangle, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlertas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { toast } from "sonner";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { SEVERIDADE_META, alertaTipoIcon, alertaTipoLabel, tempoRelativo } from "@/lib/alertLabels";
import { useCanEdit } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Alerta = any;

export default function AlertasPage() {
  const { data: alertas, isLoading } = useAlertas();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<"nao_lidos" | "todos">("nao_lidos");
  const [sev, setSev] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (alertas ?? []) as Alerta[];
  const naoLidos = list.filter((a) => !a.lido);
  const criticos = naoLidos.filter((a) => a.severidade === "critico").length;
  const avisos = naoLidos.filter((a) => a.severidade === "aviso").length;
  const tipos = useMemo(() => [...new Set(list.map((a) => a.tipo).filter(Boolean))].sort() as string[], [list]);

  const filtered = useMemo(() => {
    const base = tab === "nao_lidos" ? naoLidos : list;
    const q = busca.trim().toLowerCase();
    return base.filter((a) => (sev === "todas" || a.severidade === sev) && (tipo === "todos" || a.tipo === tipo) && (!q || `${a.titulo} ${a.mensagem ?? ""}`.toLowerCase().includes(q)));
  }, [tab, naoLidos, list, sev, tipo, busca]);
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["alertas"] }); qc.invalidateQueries({ queryKey: ["alertas_nao_lidos"] }); qc.invalidateQueries({ queryKey: ["dashboard_metrics"] }); };
  const marcar = async (ids: string[] | null, label: string) => {
    const { data, error } = await supabase.rpc("alertas_marcar_lidos", { p_ids: ids });
    if (error) { toast.error("Erro ao marcar alertas", { description: error.message }); return; }
    toast.success(label, { description: `${data ?? 0} alerta(s)` });
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alertas"
        icon={Bell}
        description="Tudo o que o sistema quer que alguém veja: revisões, terceiros, quarentena do RH, falhas do agente, licenças. Trate a causa e marque como lido."
        actions={naoLidos.length > 0 && canEdit ? <Button variant="outline" onClick={() => marcar(null, "Todos os alertas marcados como lidos")}><CheckCheck className="mr-1.5 h-4 w-4" />Marcar todos como lidos</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Não lidos" value={naoLidos.length} icon={Inbox} tone={naoLidos.length ? "warning" : "default"} hint={naoLidos.length ? "aguardando tratamento" : "tudo em dia"} />
        <StatCard label="Críticos" value={criticos} icon={ShieldAlert} tone={criticos ? "destructive" : "default"} hint="não lidos" />
        <StatCard label="Avisos" value={avisos} icon={AlertTriangle} tone={avisos ? "warning" : "default"} hint="não lidos" />
        <StatCard label="Últimos 7 dias" value={list.filter((a) => new Date(a.data).getTime() > Date.now() - 7 * 86400000).length} icon={Bell} hint="gerados no período" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "nao_lidos" | "todos"); setPage(1); }}>
          <TabsList><TabsTrigger value="nao_lidos">Não lidos ({naoLidos.length})</TabsTrigger><TabsTrigger value="todos">Todos ({list.length})</TabsTrigger></TabsList>
        </Tabs>
        <div className="relative min-w-[200px] flex-1 md:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar título ou mensagem…" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} className="pl-9" /></div>
        <Select value={sev} onValueChange={(v) => { setSev(v); setPage(1); }}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Toda severidade</SelectItem><SelectItem value="critico">Crítico</SelectItem><SelectItem value="aviso">Aviso</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent></Select>
        <Select value={tipo} onValueChange={(v) => { setTipo(v); setPage(1); }}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{tipos.map((t) => <SelectItem key={t} value={t}>{alertaTipoLabel(t)}</SelectItem>)}</SelectContent></Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : paginatedItems.length === 0 ? (
          <EmptyState message={tab === "nao_lidos" ? "Nenhum alerta pendente — tudo em dia." : "Nenhum alerta com esses filtros."} size="lg" />
        ) : (
          <ul className="divide-y">
            {paginatedItems.map((a: Alerta) => {
              const meta = SEVERIDADE_META[a.severidade] ?? SEVERIDADE_META.info;
              const Icon = alertaTipoIcon(a.tipo);
              return (
                <li key={a.id} className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40", !a.lido && "bg-primary/[0.03]")}>
                  <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", a.severidade === "critico" ? "bg-destructive/10 text-destructive" : a.severidade === "aviso" ? "bg-warning/10 text-warning" : "bg-info/10 text-info")}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.lido && <span className={cn("h-2 w-2 rounded-full", meta.dot)} />}
                      <p className={cn("text-sm", !a.lido ? "font-semibold" : "font-medium text-foreground/90")}>{a.titulo}</p>
                      <Badge variant="outline" className={cn("h-5 text-[10px]", meta.badge)}>{meta.label}</Badge>
                      <span className="text-[11px] text-muted-foreground">{alertaTipoLabel(a.tipo)}</span>
                    </div>
                    {a.mensagem && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.mensagem}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/70" title={new Date(a.data).toLocaleString("pt-BR")}>{tempoRelativo(a.data)}{a.lido ? " · lido" : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {a.ref_url && <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" asChild><Link to={a.ref_url}>Abrir<ArrowUpRight className="h-3 w-3" /></Link></Button>}
                    {!a.lido && canEdit && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => marcar([a.id], "Alerta marcado como lido")}><Check className="h-3.5 w-3.5" />Lido</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}
