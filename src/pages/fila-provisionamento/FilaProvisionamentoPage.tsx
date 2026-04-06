import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
}

export default function FilaProvisionamentoPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [actionFilter, setActionFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

    // Realtime subscription
    const channel = supabase
      .channel("iam_queue_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "iam_queue" }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fila de Provisionamento</h1>
          <p className="text-sm text-muted-foreground">Solicitações de criação, atualização e desativação de identidades</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="mr-1 h-4 w-4" />Atualizar
          </Button>
          <Button onClick={processEntraQueue} disabled={processing}>
            <Zap className="mr-1 h-4 w-4" />{processing ? "Processando..." : "Processar Fila Entra ID"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
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
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Correlation ID</th>
                    <th className="p-4 font-medium">Ação</th>
                    <th className="p-4 font-medium">Usuário</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Solicitante</th>
                    <th className="p-4 font-medium">Solicitado em</th>
                    <th className="p-4 font-medium">Processado em</th>
                     <th className="p-4 font-medium">Retries</th>
                     <th className="p-4 font-medium">Resultado</th>
                   </tr>
                 </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const aCfg = actionConfig[item.action_type] || { label: item.action_type, class: "" };
                    const sCfg = statusConfig[item.status] || { label: item.status, class: "" };
                    const displayName = item.payload_json?.displayName || item.payload_json?.samAccountName || "—";
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4">
                          <Link to={`/fila-provisionamento/${item.id}`} className="font-mono text-xs text-primary hover:underline">
                            {item.correlation_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={aCfg.class}>{aCfg.label}</Badge>
                        </td>
                        <td className="p-4 font-medium">{displayName}</td>
                        <td className="p-4">
                          <Badge variant="outline" className={sCfg.class}>{sCfg.label}</Badge>
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">{item.requested_by || "—"}</td>
                        <td className="p-4 text-muted-foreground text-xs">
                          {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">
                          {item.processed_at ? format(new Date(item.processed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {(item as any).retry_count > 0 ? (
                            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                              {(item as any).retry_count}/{(item as any).max_retries || 10}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate">
                          {item.result_message || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedItems.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma solicitação encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}
