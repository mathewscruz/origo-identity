import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw, Zap, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { toast } from "sonner";
import { useEventosJML } from "@/hooks/useOrigoData";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { authedFetch } from "@/lib/authedFetch";
import QueueTable, { statusConfig, type QueueItem } from "./sections/QueueTable";
import EventosJMLTable from "./sections/EventosJMLTable";

type JmlTabKey = "pendentes" | "quarentena" | "executados" | "erros" | "todos";
const jmlTabFilters: Record<JmlTabKey, (e: { status: string }) => boolean> = {
  pendentes: (e) => ["pendente", "executando"].includes(e.status),
  quarentena: (e) => e.status === "quarentena",
  executados: (e) => e.status === "executado",
  erros: (e) => e.status === "erro",
  todos: () => true,
};


export default function FilaProvisionamentoPage() {
  const [mainTab, setMainTab] = useState("provisionamento");

  // ---- Provisionamento state ----
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [actionFilter, setActionFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ---- JML state ----
  const [jmlTab, setJmlTab] = useState<JmlTabKey>("pendentes");
  const [jmlBusca, setJmlBusca] = useState("");
  const [jmlPage, setJmlPage] = useState(1);
  const [jmlPageSize, setJmlPageSize] = useState(25);
  const { data: eventos, isLoading: jmlLoading } = useEventosJML();

  async function loadData() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("iam_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error && data) setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("iam_queue_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "iam_queue" }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function processEntraQueue() {
    setProcessing(true);
    try {
      const res = await authedFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-iam-queue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ force: true }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error(`Erro: ${data.error}`);
      } else {
        toast.success(`Processado: ${data.summary?.success || 0} sucesso, ${data.summary?.retries || 0} retries, ${data.summary?.failures || 0} falhas`);
        loadData();
      }
    } catch (err) {
      toast.error("Erro ao processar fila Entra ID");
    }
    setProcessing(false);
  }

  // ---- Provisionamento filtered ----
  const filtered = items.filter((item) => {
    if (busca) {
      const displayName = item.payload_json?.displayName || "";
      const samAccount = item.payload_json?.samAccountName || "";
      const searchLower = busca.toLowerCase();
      if (!displayName.toLowerCase().includes(searchLower) && !samAccount.toLowerCase().includes(searchLower) && !item.correlation_id.toLowerCase().includes(searchLower)) return false;
    }
    if (statusFilter !== "todos" && item.status !== statusFilter) return false;
    if (actionFilter !== "todos" && item.action_type !== actionFilter) return false;
    return true;
  });
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);
  const counts = {
    pending: items.filter(i => i.status === "pending").length,
    processing: items.filter(i => i.status === "processing").length,
    success: items.filter(i => i.status === "success").length,
    failed: items.filter(i => i.status === "failed").length,
  };

  // ---- JML filtered ----
  const jmlList = (eventos ?? []) as any[];
  const quarentenaCount = jmlList.filter(jmlTabFilters.quarentena).length;
  const jmlFiltered = jmlList.filter(jmlTabFilters[jmlTab]).filter((e) => !jmlBusca || (e.colaborador_nome || "").toLowerCase().includes(jmlBusca.toLowerCase()));
  const { paginatedItems: jmlPaginated, safePage: jmlSafePage } = usePagination(jmlFiltered, jmlPage, jmlPageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fila de Provisionamento</h1>
          <p className="text-sm text-muted-foreground">Provisionamento de identidades e ciclo de vida JML</p>
        </div>
        {mainTab === "provisionamento" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadData}><RefreshCw className="mr-1 h-4 w-4" />Atualizar</Button>
            <Button onClick={processEntraQueue} disabled={processing}>
              <Zap className="mr-1 h-4 w-4" />{processing ? "Processando..." : "Processar Fila Entra ID"}
            </Button>
          </div>
        )}
      </div>

      <Tabs data-tour="tabs" value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="provisionamento">Fila de Provisionamento</TabsTrigger>
          <TabsTrigger value="eventos-jml">
            Eventos JML
            {quarentenaCount > 0 && <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">{quarentenaCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB: Provisionamento ===================== */}
        <TabsContent value="provisionamento" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(counts).map(([key, count]) => {
              const cfg = statusConfig[key];
              return (
                <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setStatusFilter(key); setPage(1); }}>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                    <p className="text-2xl font-semibold">{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div data-tour="search-filter" className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nome, matrícula ou correlation ID..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="success">Concluído</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas ações</SelectItem>
                <SelectItem value="create">Criação</SelectItem>
                <SelectItem value="update">Atualização</SelectItem>
                <SelectItem value="disable">Desativação</SelectItem>
                <SelectItem value="delete">Exclusão</SelectItem>
                <SelectItem value="assign_group">Atribuir Grupo</SelectItem>
                <SelectItem value="remove_group">Remover Grupo</SelectItem>
                <SelectItem value="assign_license">Atribuir Licença</SelectItem>
                <SelectItem value="remove_license">Remover Licença</SelectItem>
                <SelectItem value="assign_app">Atribuir App</SelectItem>
                <SelectItem value="remove_app">Remover App</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QueueTable items={paginatedItems} loading={loading} />
          <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </TabsContent>


        {/* ===================== TAB: Eventos JML ===================== */}
        <TabsContent value="eventos-jml" className="mt-4 space-y-4">
          {quarentenaCount > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="flex items-center gap-3 py-3">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium text-warning">{quarentenaCount} evento(s) em quarentena aguardando decisão</span>
              </CardContent>
            </Card>
          )}

          <Tabs value={jmlTab} onValueChange={(v) => { setJmlTab(v as JmlTabKey); setJmlPage(1); }}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
                <TabsTrigger value="quarentena">Quarentena</TabsTrigger>
                <TabsTrigger value="executados">Executados</TabsTrigger>
                <TabsTrigger value="erros">Erros</TabsTrigger>
                <TabsTrigger value="todos">Todos</TabsTrigger>
              </TabsList>
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar pessoa..." className="pl-9" value={jmlBusca} onChange={(e) => { setJmlBusca(e.target.value); setJmlPage(1); }} />
              </div>
            </div>

            {(["pendentes", "quarentena", "executados", "erros", "todos"] as JmlTabKey[]).map((t) => (
              <TabsContent key={t} value={t} className="mt-4">
                <EventosJMLTable items={jmlPaginated} loading={jmlLoading} />
                <TablePagination totalItems={jmlFiltered.length} pageSize={jmlPageSize} currentPage={jmlSafePage} onPageChange={setJmlPage} onPageSizeChange={(s) => { setJmlPageSize(s); setJmlPage(1); }} />
              </TabsContent>
            ))}

          </Tabs>
        </TabsContent>
      </Tabs>
      <OnboardingTour pageKey="fila_provisionamento" steps={tourSteps.fila_provisionamento} />
    </div>
  );
}

