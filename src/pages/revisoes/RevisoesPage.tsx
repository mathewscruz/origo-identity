import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { useRevisoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

const statusColors: Record<string, string> = {
  em_andamento: "bg-info/15 text-info border-info/30",
  concluida: "bg-success/15 text-success border-success/30",
  cancelada: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function RevisoesPage() {
  const { data: revisoes, isLoading } = useRevisoes();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (revisoes ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revisões de Acesso</h1>
          <p className="text-sm text-muted-foreground">Campanhas periódicas de recertificação</p>
        </div>
        <Button><Plus className="mr-1 h-4 w-4" />Nova Campanha</Button>
      </div>
      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Status</th>
            <th className="p-4 font-medium">Progresso</th><th className="p-4 font-medium">Responsável</th>
            <th className="p-4 font-medium">Data Limite</th>
          </tr></thead><tbody>
            {paginatedItems.map((r: any) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4"><Link to={`/revisoes/${r.id}`} className="font-medium text-primary hover:underline">{r.nome}</Link></td>
                <td className="p-4"><Badge variant="outline" className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ")}</Badge></td>
                <td className="p-4 min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <Progress value={r.total_itens > 0 ? (r.itens_revisados / r.total_itens) * 100 : 0} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground">{r.itens_revisados}/{r.total_itens}</span>
                  </div>
                </td>
                <td className="p-4 text-muted-foreground">{r.responsavel || "—"}</td>
                <td className="p-4 text-muted-foreground text-xs">{r.data_fim ? new Date(r.data_fim).toLocaleDateString("pt-BR") : "—"}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}
