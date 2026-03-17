import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

const perfilColors: Record<string, string> = {
  super_admin: "bg-destructive/15 text-destructive border-destructive/30",
  admin_iam: "bg-primary/15 text-primary border-primary/30",
  dono_app: "bg-warning/15 text-warning border-warning/30",
  auditor: "bg-info/15 text-info border-info/30",
  leitura: "bg-muted text-muted-foreground",
};

const perfilLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin_iam: "Admin IAM",
  dono_app: "Dono App",
  auditor: "Auditor",
  leitura: "Leitura",
};

const mockOperadores = [
  { id: "1", nome: "Admin Principal", email: "admin@origo.com", perfil: "super_admin", pessoa: null, ativo: true },
  { id: "2", nome: "João IAM", email: "joao.iam@origo.com", perfil: "admin_iam", pessoa: "João Silva", ativo: true },
  { id: "3", nome: "Maria Owner", email: "maria@origo.com", perfil: "dono_app", pessoa: "Maria Costa", ativo: true },
  { id: "4", nome: "Pedro Auditor", email: "pedro@origo.com", perfil: "auditor", pessoa: null, ativo: true },
  { id: "5", nome: "Ana Leitura", email: "ana@origo.com", perfil: "leitura", pessoa: "Ana Ferreira", ativo: false },
];

export default function OperadoresPage() {
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Perfil</th>
                <th className="pb-2 font-medium">Pessoa Vinculada</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockOperadores.map((op) => (
                <tr key={op.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                  <td className="py-3 font-medium">{op.nome}</td>
                  <td className="py-3 text-muted-foreground">{op.email}</td>
                  <td className="py-3">
                    <Badge variant="outline" className={perfilColors[op.perfil]}>
                      {perfilLabels[op.perfil]}
                    </Badge>
                  </td>
                  <td className="py-3 text-muted-foreground">{op.pessoa || "—"}</td>
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
      </CardContent>
    </Card>
  );
}
