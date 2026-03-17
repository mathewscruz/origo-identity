import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useOperadores } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

export default function OperadoresPage() {
  const { data: operadores, isLoading } = useOperadores();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Operadores</CardTitle>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Novo Operador
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
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {operadores?.map((op) => (
                  <tr key={op.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="py-3 font-medium">{op.nome}</td>
                    <td className="py-3 text-muted-foreground">{op.email}</td>
                    <td className="py-3">
                      <Badge variant={op.ativo ? "default" : "secondary"}>
                        {op.ativo ? "Ativo" : "Inativo"}
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
