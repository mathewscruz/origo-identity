import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const mockAreas = [
  { id: "1", nome: "Recursos Humanos", empresa: "Órigo Matriz", ativo: true },
  { id: "2", nome: "Tecnologia", empresa: "Órigo Matriz", ativo: true },
  { id: "3", nome: "Financeiro", empresa: "Órigo Matriz", ativo: true },
  { id: "4", nome: "Dados & BI", empresa: "Órigo Filial SP", ativo: true },
  { id: "5", nome: "Jurídico", empresa: "Órigo Matriz", ativo: false },
];

export default function AreasPage() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Áreas</CardTitle>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nova Área
        </Button>
      </CardHeader>
      <CardContent>
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
              {mockAreas.map((area) => (
                <tr key={area.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                  <td className="py-3 font-medium">{area.nome}</td>
                  <td className="py-3 text-muted-foreground">{area.empresa}</td>
                  <td className="py-3">
                    <Badge variant={area.ativo ? "default" : "secondary"}>
                      {area.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
