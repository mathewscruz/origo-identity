import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const mockCargos = [
  { id: "1", nome: "Analista de RH", area: "Recursos Humanos", ativo: true },
  { id: "2", nome: "Gerente de TI", area: "Tecnologia", ativo: true },
  { id: "3", nome: "Coordenador Financeiro", area: "Financeiro", ativo: true },
  { id: "4", nome: "Desenvolvedor Backend", area: "Tecnologia", ativo: true },
  { id: "5", nome: "Analista de Dados", area: "Dados & BI", ativo: false },
];

export default function CargosPage() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Cargos</CardTitle>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Novo Cargo
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Área</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockCargos.map((cargo) => (
                <tr key={cargo.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                  <td className="py-3 font-medium">{cargo.nome}</td>
                  <td className="py-3 text-muted-foreground">{cargo.area}</td>
                  <td className="py-3">
                    <Badge variant={cargo.ativo ? "default" : "secondary"}>
                      {cargo.ativo ? "Ativo" : "Inativo"}
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
