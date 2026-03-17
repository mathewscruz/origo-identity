import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useAreas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

export default function AreasPage() {
  const { data: areas, isLoading } = useAreas();
  const [page, setPage] = useState(1);

  const list = (areas ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Áreas</CardTitle>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" />Nova Área</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Nome</th>
                    <th className="pb-2 font-medium">Empresa</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((area: any) => (
                    <tr key={area.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                      <td className="py-3 font-medium">{area.nome}</td>
                      <td className="py-3 text-muted-foreground">{area.empresas?.nome || "—"}</td>
                      <td className="py-3">
                        <Badge variant={area.ativo ? "default" : "secondary"}>{area.ativo ? "Ativo" : "Inativo"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination totalItems={list.length} pageSize={25} currentPage={safePage} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
