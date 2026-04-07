import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Copy, Play, Power } from "lucide-react";
import { Link } from "react-router-dom";
import { useRegras } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

export default function RegrasPage() {
  const { data: regras, isLoading } = useRegras();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (regras ?? []).filter((r: any) => !busca || r.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Motor de Regras</h1>
          <p className="text-sm text-muted-foreground">Regras multi-critério com prioridade, conflito e simulação</p>
        </div>
        <Button asChild><Link to="/regras/nova"><Plus className="mr-1 h-4 w-4" />Nova Regra</Link></Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar regras..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
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
                    <th className="p-4 font-medium">Prioridade</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Criado por</th>
                    <th className="p-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((regra: any) => (
                    <tr key={regra.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4"><Link to={`/regras/${regra.id}/editar`} className="font-medium text-primary hover:underline">{regra.nome}</Link></td>
                      <td className="p-4"><Badge variant="outline">{regra.prioridade}</Badge></td>
                      <td className="p-4"><Badge variant={regra.status === "ativa" ? "default" : "secondary"}>{({ ativa: "Ativa", inativa: "Inativa", rascunho: "Rascunho" } as Record<string, string>)[regra.status] || regra.status}</Badge></td>
                      <td className="p-4 text-muted-foreground">{regra.criado_por || "—"}</td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Simular"><Play className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicar"><Copy className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Desativar"><Power className="h-3 w-3" /></Button>
                        </div>
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
