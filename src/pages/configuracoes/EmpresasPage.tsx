import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const mockEmpresas = [
  { id: "1", nome: "Órigo Matriz", cnpj: "12.345.678/0001-00", tipo: "Matriz", ativo: true },
  { id: "2", nome: "Órigo Filial SP", cnpj: "12.345.678/0002-81", tipo: "Filial", ativo: true },
  { id: "3", nome: "TechConsult Ltda", cnpj: "98.765.432/0001-10", tipo: "Terceira", ativo: true },
  { id: "4", nome: "SecureIT S.A.", cnpj: "11.222.333/0001-44", tipo: "Terceira", ativo: false },
];

export default function EmpresasPage() {
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">CNPJ</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockEmpresas.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                  <td className="py-3 font-medium">{emp.nome}</td>
                  <td className="py-3 text-muted-foreground">{emp.cnpj}</td>
                  <td className="py-3">
                    <Badge variant="outline">{emp.tipo}</Badge>
                  </td>
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
      </CardContent>
    </Card>
  );
}
