import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Check, Ban, ExternalLink } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { useEventosJML } from "@/hooks/useOrigoData";
import { useUpdateJmlStatus } from "@/hooks/mutations/useJmlEvent";

type TabKey = "pendentes" | "quarentena" | "executados" | "erros" | "todos";

const tabFilters: Record<TabKey, (e: { status: string }) => boolean> = {
  pendentes: (e) => ["pendente", "executando"].includes(e.status),
  quarentena: (e) => e.status === "quarentena",
  executados: (e) => e.status === "executado",
  erros: (e) => e.status === "erro",
  todos: () => true,
};

const tipoLabel: Record<string, string> = {
  joiner: "Joiner", mover: "Mover", leaver: "Leaver",
  pre_leaver: "Pré-Leaver", pre_leaver_revertido: "Pré-Leaver revertido",
};
const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
  pre_leaver: "bg-warning text-warning-foreground",
  pre_leaver_revertido: "bg-muted text-muted-foreground",
};
const statusLabel: Record<string, string> = {
  pendente: "Pendente", quarentena: "Quarentena", executando: "Executando",
  executado: "Executado", erro: "Erro", cancelado: "Cancelado",
};
const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};

export default function EventosJMLPage() {
  const { data: eventos, isLoading, refetch } = useEventosJML();
  const updateStatus = useUpdateJmlStatus();

  const [tab, setTab] = useState<TabKey>("pendentes");
  const [busca, setBusca] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (eventos ?? []) as any[];

  const counts = useMemo(() => ({
    pendentes: list.filter(tabFilters.pendentes).length,
    quarentena: list.filter(tabFilters.quarentena).length,
    executados: list.filter(tabFilters.executados).length,
    erros: list.filter(tabFilters.erros).length,
    todos: list.length,
  }), [list]);

  const filtered = useMemo(() => list
    .filter(tabFilters[tab])
    .filter((e) => tipoFilter === "todos" || e.tipo === tipoFilter)
    .filter((e) => !busca || (e.colaborador_nome || "").toLowerCase().includes(busca.toLowerCase())),
    [list, tab, tipoFilter, busca]);

  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const selectableIds = paginatedItems
    .filter((e: any) => !["executado", "cancelado"].includes(e.status))
    .map((e: any) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...selectableIds]);
    });
  }
  async function bulkAction(status: "executando" | "cancelado" | "pendente") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    for (const id of ids) {
      await updateStatus.mutateAsync({
        eventoId: id, status,
        resetTentativas: status === "pendente",
      });
    }
    setSelected(new Set());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos JML</h1>
          <p className="text-sm text-muted-foreground">Linha do tempo operacional do ciclo de vida (Joiner / Mover / Leaver)</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-1 h-4 w-4" />Atualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({counts.pendentes})</TabsTrigger>
          <TabsTrigger value="quarentena">
            Quarentena ({counts.quarentena})
            {counts.quarentena > 0 && <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">!</Badge>}
          </TabsTrigger>
          <TabsTrigger value="executados">Executados ({counts.executados})</TabsTrigger>
          <TabsTrigger value="erros">Erros ({counts.erros})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por colaborador..."
            className="pl-9"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={tipoFilter} onValueChange={(v) => { setTipoFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="joiner">Joiner</SelectItem>
            <SelectItem value="mover">Mover</SelectItem>
            <SelectItem value="leaver">Leaver</SelectItem>
            <SelectItem value="pre_leaver">Pré-Leaver</SelectItem>
            <SelectItem value="pre_leaver_revertido">Pré-Leaver revertido</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selecionado(s)</span>
            <Button size="sm" variant="outline" onClick={() => bulkAction("executando")} disabled={updateStatus.isPending}>
              <Check className="mr-1 h-3 w-3" />Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction("pendente")} disabled={updateStatus.isPending}>
              <RefreshCw className="mr-1 h-3 w-3" />Reprocessar
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction("cancelado")} disabled={updateStatus.isPending}>
              <Ban className="mr-1 h-3 w-3" />Cancelar
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState message="Nenhum evento JML encontrado." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="p-3 w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={selectableIds.length === 0} />
                  </th>
                  <th className="p-3 font-medium">Tipo</th>
                  <th className="p-3 font-medium">Pessoa</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Tentativas</th>
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((ev: any) => {
                  const isFinal = ["executado", "cancelado"].includes(ev.status);
                  return (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(ev.id)}
                          onCheckedChange={() => toggle(ev.id)}
                          disabled={isFinal}
                        />
                      </td>
                      <td className="p-3">
                        <Badge className={`${tipoColors[ev.tipo] || "bg-muted"} text-[10px] uppercase`}>
                          {tipoLabel[ev.tipo] || ev.tipo}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {ev.colaborador_id ? (
                          <Link to={`/colaboradores/${ev.colaborador_id}`} className="font-medium text-primary hover:underline">
                            {ev.colaborador_nome || "Desconhecido"}
                          </Link>
                        ) : (
                          <span className="font-medium">{ev.colaborador_nome || "Desconhecido"}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={statusColors[ev.status] || ""}>
                          {statusLabel[ev.status] || ev.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{ev.tentativas}/{ev.max_tentativas}</td>
                      <td className="p-3 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" className="h-7" asChild>
                          <Link to={`/eventos-jml/${ev.id}`}><ExternalLink className="h-3 w-3" /></Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <TablePagination
        currentPage={safePage}
        totalItems={filtered.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}
