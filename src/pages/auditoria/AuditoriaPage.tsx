import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuditoria } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

const entidadeColors: Record<string, string> = {
  pessoa: "bg-info/15 text-info border-info/30",
  aplicacao: "bg-primary/15 text-primary border-primary/30",
  regra: "bg-muted text-muted-foreground",
  evento_jml: "bg-success/15 text-success border-success/30",
  excecao: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AuditoriaPage() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data: auditoria, isLoading } = useAuditoria();

  const list = (auditoria ?? []).filter((a: any) => !busca || a.acao.toLowerCase().includes(busca.toLowerCase()) || (a.resumo || "").toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline"><Download className="mr-1 h-4 w-4" />Exportar CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Timestamp</th><th className="p-4 font-medium">Operador</th>
            <th className="p-4 font-medium">Ação</th><th className="p-4 font-medium">Entidade</th>
            <th className="p-4 font-medium">Resumo</th><th className="p-4 font-medium">IP</th>
            <th className="p-4 font-medium"></th>
          </tr></thead><tbody>
            {paginatedItems.map((a: any) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4 text-xs text-muted-foreground font-mono">{new Date(a.timestamp).toLocaleString("pt-BR")}</td>
                <td className="p-4 text-muted-foreground">{a.operador || "—"}</td>
                <td className="p-4 font-medium">{a.acao}</td>
                <td className="p-4"><Badge variant="outline" className={entidadeColors[a.entidade] || ""}>{a.entidade.replace(/_/g, " ")}</Badge></td>
                <td className="p-4 text-muted-foreground text-xs max-w-[250px] truncate">{a.resumo || "—"}</td>
                <td className="p-4 text-xs text-muted-foreground font-mono">{a.ip || "—"}</td>
                <td className="p-4">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelected(a); setDetailOpen(true); }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhe da Auditoria</DialogTitle></DialogHeader>
          {selected && (
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-[400px]">
              {JSON.stringify(selected, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
