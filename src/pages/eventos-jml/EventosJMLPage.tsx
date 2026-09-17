import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ExternalLink, Search, UserMinus, UserPlus, ArrowLeftRight, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { useEventosJML } from "@/hooks/useOrigoData";
import { JML_ORIGEM_LABELS, JML_TIPO_META } from "@/lib/queueLabels";
import { humanize } from "@/lib/labels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function summary(ev: Row): string {
  const a = ev.dados_antes || {}; const d = ev.dados_depois || {};
  if (ev.tipo === "mover") {
    if (a.cargo || d.cargo) return `${a.cargo || "—"} → ${d.cargo || "—"}`;
    if (a.area || d.area) return `Área: ${a.area || "—"} → ${d.area || "—"}`;
    if (Array.isArray(d.changed)) return `Campos: ${d.changed.join(", ")}`;
  }
  if (ev.tipo === "leaver") return [d.status ? `Status: ${humanize(d.status)}` : null, a.tipo_desativacao ? `(${humanize(a.tipo_desativacao)})` : null, d.motivo ? `— ${d.motivo}` : null].filter(Boolean).join(" ");
  if (ev.tipo === "joiner") return [d.matricula ? `Mat. ${d.matricula}` : null, d.status ? `Status: ${humanize(d.status)}` : null, d.perfis_restaurados !== undefined ? `${d.perfis_restaurados} perfil(is) restaurado(s)` : null].filter(Boolean).join(" · ");
  if (ev.tipo === "pre_leaver") return d.motivo ? String(d.motivo) : "Suspensão preventiva";
  return "";
}

export default function EventosJMLPage() {
  const { data: eventos, isLoading } = useEventosJML();
  const [busca, setBusca] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [origemFilter, setOrigemFilter] = useState("todos");
  const [periodo, setPeriodo] = useState("30");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (eventos ?? []) as Row[];
  const origens = useMemo(() => Array.from(new Set(list.map((e) => e.origem).filter(Boolean))).sort() as string[], [list]);
  const since = useMemo(() => periodo === "todos" ? 0 : Date.now() - Number(periodo) * 86400000, [periodo]);

  const filtered = useMemo(() => list
    .filter((e) => !since || new Date(e.created_at).getTime() >= since)
    .filter((e) => tipoFilter === "todos" || e.tipo === tipoFilter)
    .filter((e) => origemFilter === "todos" || e.origem === origemFilter)
    .filter((e) => !busca || (e.colaborador_nome || "").toLowerCase().includes(busca.toLowerCase())),
  [list, since, tipoFilter, origemFilter, busca]);

  const counts = useMemo(() => {
    const inPeriod = list.filter((e) => !since || new Date(e.created_at).getTime() >= since);
    const people = (tipo: string) => new Set(inPeriod.filter((e) => e.tipo === tipo).map((e) => e.colaborador_id || e.terceiro_id || e.colaborador_nome)).size;
    return { joiner: people("joiner"), mover: people("mover"), leaver: people("leaver"), pre_leaver: people("pre_leaver") };
  }, [list, since]);

  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Eventos JML"
        icon={Activity}
        description="Registro imutável do ciclo de vida (Joiner / Mover / Leaver / pré-leaver). Cada evento aponta para as ações que gerou na fila."
        actions={
          <Select value={periodo} onValueChange={(v) => { setPeriodo(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="365">Último ano</SelectItem><SelectItem value="todos">Tudo</SelectItem></SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Entradas (joiner)" value={counts.joiner} icon={UserPlus} tone="success" active={tipoFilter === "joiner"} onClick={() => { setTipoFilter(tipoFilter === "joiner" ? "todos" : "joiner"); setPage(1); }} hint="pessoas no período" />
        <StatCard label="Mudanças (mover)" value={counts.mover} icon={ArrowLeftRight} tone="info" active={tipoFilter === "mover"} onClick={() => { setTipoFilter(tipoFilter === "mover" ? "todos" : "mover"); setPage(1); }} hint="pessoas no período" />
        <StatCard label="Saídas (leaver)" value={counts.leaver} icon={UserMinus} tone="destructive" active={tipoFilter === "leaver"} onClick={() => { setTipoFilter(tipoFilter === "leaver" ? "todos" : "leaver"); setPage(1); }} hint="pessoas no período" />
        <StatCard label="Suspensões preventivas" value={counts.pre_leaver} icon={ShieldAlert} tone="warning" active={tipoFilter === "pre_leaver"} onClick={() => { setTipoFilter(tipoFilter === "pre_leaver" ? "todos" : "pre_leaver"); setPage(1); }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por pessoa…" className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={tipoFilter} onValueChange={(v) => { setTipoFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(JML_TIPO_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={origemFilter} onValueChange={(v) => { setOrigemFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            {origens.map((o) => <SelectItem key={o} value={o}>{JML_ORIGEM_LABELS[o] || o}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} evento(s)</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10"><EmptyState message="Nenhum evento JML com esses filtros." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 font-medium">Tipo</th>
                  <th className="p-3 font-medium">Pessoa</th>
                  <th className="p-3 font-medium hidden md:table-cell">Resumo</th>
                  <th className="p-3 font-medium hidden lg:table-cell">Origem</th>
                  <th className="p-3 font-medium">Quando</th>
                  <th className="w-16 p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((ev: Row) => {
                  const tipo = JML_TIPO_META[ev.tipo];
                  const personLink = ev.colaborador_id ? `/colaboradores/${ev.colaborador_id}` : ev.terceiro_id ? `/terceiros/${ev.terceiro_id}` : null;
                  return (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3"><Badge className={`${tipo?.className || "bg-muted"} text-[10px] uppercase`}>{tipo?.label || ev.tipo}</Badge></td>
                      <td className="p-3">
                        {personLink ? <Link to={personLink} className="font-medium text-primary hover:underline">{ev.colaborador_nome || "—"}</Link> : <span className="font-medium">{ev.colaborador_nome || "—"}</span>}
                        {ev.terceiro_id && <span className="ml-1 text-[10px] text-muted-foreground">Terceiro</span>}
                      </td>
                      <td className="p-3 hidden md:table-cell max-w-[360px] truncate text-xs text-muted-foreground" title={summary(ev)}>{summary(ev) || "—"}</td>
                      <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">{JML_ORIGEM_LABELS[ev.origem] || ev.origem || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(ev.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-3"><Button variant="ghost" size="sm" className="h-7" asChild><Link to={`/eventos-jml/${ev.id}`}><ExternalLink className="h-3 w-3" /></Link></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <TablePagination currentPage={safePage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}
