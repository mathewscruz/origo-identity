import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { useLicencas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

export default function LicencasPage() {
  const { data: licencas, isLoading } = useLicencas();

  const list = licencas ?? [];
  const criticos = list.filter((l) => l.total > 0 && Math.round((l.em_uso / l.total) * 100) >= 90).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Licenças</h1>
          <p className="text-sm text-muted-foreground">Inventário, atribuição e revogação de licenças</p>
        </div>
        <Button><Plus className="mr-1 h-4 w-4" />Novo Tipo</Button>
      </div>

      {criticos > 0 && (
        <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex items-center gap-3 py-3">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">{criticos} tipo(s) com disponibilidade crítica (&lt;10%)</span>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Aplicação</th>
            <th className="p-4 font-medium">Total</th><th className="p-4 font-medium">Em uso</th>
            <th className="p-4 font-medium min-w-[180px]">Disponibilidade</th><th className="p-4 font-medium">Tipo</th>
            <th className="p-4 font-medium">Renovação</th>
          </tr></thead><tbody>
            {list.map((l) => {
              const pct = l.total > 0 ? Math.round((l.em_uso / l.total) * 100) : 0;
              const disp = l.total - l.em_uso;
              return (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-4 font-medium text-primary">{l.nome}</td>
                  <td className="p-4 text-muted-foreground">{(l.aplicacoes as any)?.nome || "—"}</td>
                  <td className="p-4 text-muted-foreground">{l.total}</td>
                  <td className="p-4 text-muted-foreground">{l.em_uso}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className={`h-2 flex-1 ${pct >= 90 ? "[&>div]:bg-destructive" : pct >= 75 ? "[&>div]:bg-warning" : ""}`} />
                      <span className={`text-xs font-medium ${pct >= 90 ? "text-destructive" : "text-muted-foreground"}`}>{disp} disp.</span>
                    </div>
                  </td>
                  <td className="p-4"><Badge variant="outline">{l.tipo || "SaaS"}</Badge></td>
                  <td className="p-4 text-muted-foreground text-xs">{l.renovacao ? new Date(l.renovacao).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </CardContent></Card>
    </div>
  );
}
