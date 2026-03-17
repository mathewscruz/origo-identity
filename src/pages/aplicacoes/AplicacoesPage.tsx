import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, CheckCircle } from "lucide-react";
import { useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AplicacoesPage() {
  const { data: apps, isLoading } = useAplicacoes();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (apps ?? []).filter((a: any) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <p className="text-sm text-muted-foreground">Catálogo corporativo de aplicações</p>
        </div>
        <Button><Plus className="mr-1 h-4 w-4" />Nova Aplicação</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar aplicações..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Criticidade</th>
                    <th className="p-4 font-medium">Autenticação</th>
                    <th className="p-4 font-medium">Owner</th>
                    <th className="p-4 font-medium">Aprovação</th>
                    <th className="p-4 font-medium">Integração</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((app: any) => (
                    <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                      <td className="p-4 font-medium text-primary">{app.nome}</td>
                      <td className="p-4"><Badge variant="outline" className={criticidadeColors[app.criticidade]}>{app.criticidade}</Badge></td>
                      <td className="p-4"><Badge variant="outline">{app.tipo_auth || "—"}</Badge></td>
                      <td className="p-4 text-muted-foreground">{app.owner || "—"}</td>
                      <td className="p-4">
                        {app.aprovacao_necessaria ? <CheckCircle className="h-4 w-4 text-success" /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4">
                        {app.integracao_ativa ? (
                          <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativa</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">Inativa</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}
