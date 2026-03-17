import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useEmpresas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

export default function EmpresasPage() {
  const { data: empresas, isLoading } = useEmpresas();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Empresas</CardTitle>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nova Empresa
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">CNPJ</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {empresas?.map((emp) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="py-3 font-medium">{emp.nome}</td>
                    <td className="py-3 text-muted-foreground">{emp.cnpj || "—"}</td>
                    <td className="py-3">
                      <Badge variant={emp.ativo ? "default" : "secondary"}>
                        {emp.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
