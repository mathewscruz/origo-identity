import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw, Zap, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useEventosJML } from "@/hooks/useOrigoData";
import EmptyState from "@/components/EmptyState";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { authedFetch } from "@/lib/authedFetch";

// ---- Provisionamento configs ----
const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Processando", class: "bg-info/15 text-info border-info/30" },
  success: { label: "Concluído", class: "bg-success/15 text-success border-success/30" },
  failed: { label: "Falhou", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const actionConfig: Record<string, { label: string; class: string }> = {
  create: { label: "Criação", class: "bg-success/15 text-success border-success/30" },
  create_if_not_exists: { label: "Criação (Auto)", class: "bg-success/15 text-success border-success/30" },
  update: { label: "Atualização", class: "bg-info/15 text-info border-info/30" },
  disable: { label: "Desativação", class: "bg-warning/15 text-warning border-warning/30" },
  delete: { label: "Exclusão", class: "bg-destructive/15 text-destructive border-destructive/30" },
  assign_group: { label: "Atribuir Grupo", class: "bg-primary/15 text-primary border-primary/30" },
  remove_group: { label: "Remover Grupo", class: "bg-muted text-muted-foreground border-muted" },
  assign_license: { label: "Atribuir Licença", class: "bg-primary/15 text-primary border-primary/30" },
  remove_license: { label: "Remover Licença", class: "bg-muted text-muted-foreground border-muted" },
  assign_app: { label: "Atribuir App", class: "bg-primary/15 text-primary border-primary/30" },
  remove_app: { label: "Remover App", class: "bg-muted text-muted-foreground border-muted" },
  disable_entra: { label: "Desativar Entra", class: "bg-warning/15 text-warning border-warning/30" },
  enable_entra: { label: "Reativar Entra", class: "bg-success/15 text-success border-success/30" },
  update_entra: { label: "Atualizar Entra", class: "bg-info/15 text-info border-info/30" },
};

// ---- JML configs ----
const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};
const jmlStatusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};

interface QueueItem {
  id: string;
  action_type: string;
  status: string;
  payload_json: any;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
  result_message: string | null;
  correlation_id: string;
  colaborador_id: string | null;
  retry_count: number;
  max_retries: number;
}

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

          <Card data-tour="table">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="p-4 font-medium hidden lg:table-cell">Correlation ID</th>
                        <th className="p-4 font-medium">Ação</th>
                        <th className="p-4 font-medium">Usuário</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium hidden md:table-cell">Solicitante</th>
                        <th className="p-4 font-medium hidden md:table-cell">Solicitado em</th>
                        <th className="p-4 font-medium hidden lg:table-cell">Processado em</th>
                        <th className="p-4 font-medium hidden lg:table-cell">Retries</th>
                        <th className="p-4 font-medium hidden lg:table-cell">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item) => {
                        const aCfg = actionConfig[item.action_type] || { label: item.action_type, class: "" };
                        const sCfg = statusConfig[item.status] || { label: item.status, class: "" };
                        const displayName = item.payload_json?.displayName || item.payload_json?.samAccountName || "—";
                        return (
                          <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="p-4 hidden lg:table-cell">
                              <Link to={`/fila-provisionamento/${item.id}`} className="font-mono text-xs text-primary hover:underline">
                                {item.correlation_id.slice(0, 8)}...
                              </Link>
                            </td>
                            <td className="p-4"><Badge variant="outline" className={aCfg.class}>{aCfg.label}</Badge></td>
                            <td className="p-4 font-medium">{displayName}</td>
                            <td className="p-4"><Badge variant="outline" className={sCfg.class}>{sCfg.label}</Badge></td>
                            <td className="p-4 text-muted-foreground text-xs hidden md:table-cell">{item.requested_by || "—"}</td>
                            <td className="p-4 text-muted-foreground text-xs hidden md:table-cell">{format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</td>
                            <td className="p-4 text-muted-foreground text-xs hidden lg:table-cell">{item.processed_at ? format(new Date(item.processed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</td>
                            <td className="p-4 text-xs text-muted-foreground hidden lg:table-cell">
                              {item.retry_count > 0 ? (
                                <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">{item.retry_count}/{item.max_retries || 10}</Badge>
                              ) : "—"}
                            </td>
                            <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">{item.result_message || "—"}</td>
                          </tr>
                        );
                      })}
                      {paginatedItems.length === 0 && (
                        <tr><td colSpan={9}><EmptyState message="Nenhuma solicitação encontrada." /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
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
                <Card><CardContent className="p-0">
                  {jmlLoading ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground">
                        <th className="p-4 font-medium">Tipo</th>
                        <th className="p-4 font-medium">Pessoa</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium">Tentativas</th>
                        <th className="p-4 font-medium">Data</th>
                      </tr></thead>
                      <tbody>
                        {jmlPaginated.map((ev: any) => (
                          <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="p-4"><Badge className={`${tipoColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo.charAt(0)}</Badge></td>
                            <td className="p-4"><Link to={`/eventos-jml/${ev.id}`} className="font-medium text-primary hover:underline">{ev.colaborador_nome || "Desconhecido"}</Link></td>
                            <td className="p-4"><Badge variant="outline" className={jmlStatusColors[ev.status] || ""}>{({ pendente: "Pendente", quarentena: "Quarentena", executando: "Executando", executado: "Executado", erro: "Erro", cancelado: "Cancelado" } as Record<string, string>)[ev.status] || ev.status}</Badge></td>
                            <td className="p-4 text-muted-foreground">{ev.tentativas}/{ev.max_tentativas}</td>
                            <td className="p-4 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</td>
                          </tr>
                        ))}
                        {jmlPaginated.length === 0 && <tr><td colSpan={5}><EmptyState message="Nenhum evento." /></td></tr>}
                      </tbody>
                    </table>
                  )}
                </CardContent></Card>
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

