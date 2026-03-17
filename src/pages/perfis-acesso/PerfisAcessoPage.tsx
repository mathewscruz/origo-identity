import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const sensibilidadeConfig: Record<string, { label: string; class: string; icon: typeof Shield }> = {
  normal: { label: "Normal", class: "bg-muted text-muted-foreground", icon: Shield },
  sensivel: { label: "Sensível", class: "bg-warning/15 text-warning border-warning/30", icon: ShieldAlert },
  privilegiado: { label: "Privilegiado", class: "bg-destructive/15 text-destructive border-destructive/30", icon: ShieldCheck },
};

const mockPerfis = [
  { id: "1", nome: "Acesso Básico Office 365", sensibilidade: "normal", tipo: "padrao", apps: 2, pessoas: 847, aprovacaoExtra: false, validade: null },
  { id: "2", nome: "Desenvolvedor Full-Stack", sensibilidade: "sensivel", tipo: "padrao", apps: 5, pessoas: 42, aprovacaoExtra: true, validade: null },
  { id: "3", nome: "Admin Infraestrutura", sensibilidade: "privilegiado", tipo: "padrao", apps: 8, pessoas: 6, aprovacaoExtra: true, validade: null },
  { id: "4", nome: "Acesso Temporário SAP", sensibilidade: "sensivel", tipo: "temporario", apps: 1, pessoas: 3, aprovacaoExtra: true, validade: 90 },
  { id: "5", nome: "Analista Financeiro", sensibilidade: "sensivel", tipo: "padrao", apps: 3, pessoas: 28, aprovacaoExtra: false, validade: null },
  { id: "6", nome: "Leitura BI", sensibilidade: "normal", tipo: "padrao", apps: 2, pessoas: 156, aprovacaoExtra: false, validade: null },
];

export default function PerfisAcessoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground">Conjuntos nomeados de acessos a aplicações</p>
        </div>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Novo Perfil
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar perfis..." className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Nome</th>
                  <th className="p-4 font-medium">Sensibilidade</th>
                  <th className="p-4 font-medium">Tipo</th>
                  <th className="p-4 font-medium">Apps</th>
                  <th className="p-4 font-medium">Pessoas</th>
                  <th className="p-4 font-medium">Aprovação Extra</th>
                  <th className="p-4 font-medium">Validade</th>
                </tr>
              </thead>
              <tbody>
                {mockPerfis.map((perfil) => {
                  const sens = sensibilidadeConfig[perfil.sensibilidade];
                  return (
                    <tr key={perfil.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4">
                        <Link to={`/perfis-acesso/${perfil.id}`} className="font-medium text-primary hover:underline">
                          {perfil.nome}
                        </Link>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={sens.class}>
                          {sens.label}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {perfil.tipo === "padrao" ? "Padrão" : "Temporário"}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">{perfil.apps}</td>
                      <td className="p-4 text-muted-foreground">{perfil.pessoas}</td>
                      <td className="p-4">
                        {perfil.aprovacaoExtra ? (
                          <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Sim</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {perfil.validade ? `${perfil.validade} dias` : "Indefinida"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
