import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const mockLocalidades = [
  { id: "1", nome: "Sede SP", cidade: "São Paulo", estado: "SP", pais: "Brasil", ativo: true },
  { id: "2", nome: "Filial RJ", cidade: "Rio de Janeiro", estado: "RJ", pais: "Brasil", ativo: true },
  { id: "3", nome: "Escritório BH", cidade: "Belo Horizonte", estado: "MG", pais: "Brasil", ativo: true },
  { id: "4", nome: "Remoto", cidade: "—", estado: "—", pais: "Brasil", ativo: true },
];

export default function LocalidadesPage() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Localidades</CardTitle>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nova Localidade
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Cidade</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium">País</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockLocalidades.map((loc) => (
                <tr key={loc.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                  <td className="py-3 font-medium">{loc.nome}</td>
                  <td className="py-3 text-muted-foreground">{loc.cidade}</td>
                  <td className="py-3 text-muted-foreground">{loc.estado}</td>
                  <td className="py-3 text-muted-foreground">{loc.pais}</td>
                  <td className="py-3">
                    <Badge variant={loc.ativo ? "default" : "secondary"}>
                      {loc.ativo ? "Ativo" : "Inativo"}
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
