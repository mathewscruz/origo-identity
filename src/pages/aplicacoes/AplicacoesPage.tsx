import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, CheckCircle, XCircle } from "lucide-react";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

const mockApps = [
  { id: "1", nome: "Microsoft 365", criticidade: "critica", tipoAuth: "SSO Entra", owner: "Maria Owner", perfis: 4, licencas: 1200, aprovacao: true, integracao: true },
  { id: "2", nome: "SAP ERP", criticidade: "critica", tipoAuth: "SAML", owner: "João IAM", perfis: 6, licencas: 340, aprovacao: true, integracao: false },
  { id: "3", nome: "Jira", criticidade: "alta", tipoAuth: "SSO Entra", owner: "Maria Owner", perfis: 3, licencas: 500, aprovacao: false, integracao: true },
  { id: "4", nome: "Slack", criticidade: "media", tipoAuth: "SSO Entra", owner: "João IAM", perfis: 2, licencas: 800, aprovacao: false, integracao: true },
  { id: "5", nome: "Portal Interno", criticidade: "baixa", tipoAuth: "Local", owner: "Admin", perfis: 2, licencas: 0, aprovacao: false, integracao: false },
];

export default function AplicacoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <p className="text-sm text-muted-foreground">Catálogo corporativo de aplicações</p>
        </div>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nova Aplicação
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar aplicações..." className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Nome</th>
                  <th className="p-4 font-medium">Criticidade</th>
                  <th className="p-4 font-medium">Autenticação</th>
                  <th className="p-4 font-medium">Owner</th>
                  <th className="p-4 font-medium">Perfis</th>
                  <th className="p-4 font-medium">Licenças</th>
                  <th className="p-4 font-medium">Aprovação</th>
                  <th className="p-4 font-medium">Integração</th>
                </tr>
              </thead>
              <tbody>
                {mockApps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="p-4 font-medium text-primary">{app.nome}</td>
                    <td className="p-4">
                      <Badge variant="outline" className={criticidadeColors[app.criticidade]}>
                        {app.criticidade}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{app.tipoAuth}</Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{app.owner}</td>
                    <td className="p-4 text-muted-foreground">{app.perfis}</td>
                    <td className="p-4 text-muted-foreground">{app.licencas || "—"}</td>
                    <td className="p-4">
                      {app.aprovacao ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      {app.integracao ? (
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
        </CardContent>
      </Card>
    </div>
  );
}
