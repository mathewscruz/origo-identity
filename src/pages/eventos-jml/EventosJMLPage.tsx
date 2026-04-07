import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useEventosJML } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};
const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};

type TabKey = "pendentes" | "quarentena" | "executados" | "erros" | "todos";
const tabFilters: Record<TabKey, (e: { status: string }) => boolean> = {
  pendentes: (e) => ["pendente", "executando"].includes(e.status),
  quarentena: (e) => e.status === "quarentena",
  executados: (e) => e.status === "executado",
  erros: (e) => e.status === "erro",
  todos: () => true,
};

export default function EventosJMLPage() {
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data: eventos, isLoading } = useEventosJML();

  const list = (eventos ?? []) as any[];
  const quarentenaCount = list.filter(tabFilters.quarentena).length;
  const filtered = list.filter(tabFilters[tab]).filter((e) => !busca || (e.colaborador_nome || "").toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos JML</h1>
        <p className="text-sm text-muted-foreground">Central de processamento e monitoramento do ciclo de vida</p>
      </div>

      {quarentenaCount > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">{quarentenaCount} evento(s) em quarentena</span>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); }}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pendentes">Pendentes ({list.filter(tabFilters.pendentes).length})</TabsTrigger>
            <TabsTrigger value="quarentena">Quarentena ({quarentenaCount})</TabsTrigger>
            <TabsTrigger value="executados">Executados ({list.filter(tabFilters.executados).length})</TabsTrigger>
            <TabsTrigger value="erros">Erros ({list.filter(tabFilters.erros).length})</TabsTrigger>
            <TabsTrigger value="todos">Todos ({list.length})</TabsTrigger>
          </TabsList>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar pessoa..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
          </div>
        </div>

        {["pendentes", "quarentena", "executados", "erros", "todos"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Pessoa</th>
                    <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Tentativas</th>
                    <th className="p-4 font-medium">Data</th>
                  </tr></thead>
                  <tbody>
                    {paginatedItems.map((ev: any) => (
                      <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4"><Badge className={`${tipoColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo.charAt(0)}</Badge></td>
                        <td className="p-4"><Link to={`/eventos-jml/${ev.id}`} className="font-medium text-primary hover:underline">{ev.colaborador_nome || "Desconhecido"}</Link></td>
                        <td className="p-4"><Badge variant="outline" className={statusColors[ev.status] || ""}>{({ pendente: "Pendente", quarentena: "Quarentena", executando: "Executando", executado: "Executado", erro: "Erro", cancelado: "Cancelado" } as Record<string, string>)[ev.status] || ev.status}</Badge></td>
                        <td className="p-4 text-muted-foreground">{ev.tentativas}/{ev.max_tentativas}</td>
                        <td className="p-4 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    ))}
                    {paginatedItems.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum evento.</td></tr>}
                  </tbody>
                </table>
              )}
            </CardContent></Card>
            <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
