import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { usePerfisAcesso } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const sensibilidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Normal", class: "bg-muted text-muted-foreground" },
  media: { label: "Sensível", class: "bg-warning/15 text-warning border-warning/30" },
  alta: { label: "Alto", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Privilegiado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

export default function PerfisAcessoPage() {
  const { data: perfis, isLoading } = usePerfisAcesso();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground">Conjuntos nomeados de acessos a aplicações</p>
        </div>
        <Button><Plus className="mr-1 h-4 w-4" />Novo Perfil</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar perfis..." className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Aplicação</th>
                    <th className="p-4 font-medium">Sensibilidade</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis?.map((p) => {
                    const sens = sensibilidadeConfig[p.sensibilidade] || { label: p.sensibilidade, class: "" };
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4"><Link to={`/perfis-acesso/${p.id}`} className="font-medium text-primary hover:underline">{p.nome}</Link></td>
                        <td className="p-4 text-muted-foreground">{(p.aplicacoes as any)?.nome || "—"}</td>
                        <td className="p-4"><Badge variant="outline" className={sens.class}>{sens.label}</Badge></td>
                        <td className="p-4"><Badge variant="outline">{p.tipo}</Badge></td>
                        <td className="p-4"><Badge variant={p.ativo ? "default" : "secondary"}>{p.ativo ? "Ativo" : "Inativo"}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
