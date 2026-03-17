import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";

const modoColors: Record<string, string> = {
  automatico: "bg-success/15 text-success border-success/30",
  manual: "bg-warning/15 text-warning border-warning/30",
  sob_demanda: "bg-info/15 text-info border-info/30",
};

const mockLicencas = [
  { id: "1", nome: "Microsoft 365 E3", app: "Microsoft 365", total: 1500, emUso: 1247, modo: "automatico", revogacaoAuto: true },
  { id: "2", nome: "Jira Software", app: "Jira", total: 500, emUso: 423, modo: "automatico", revogacaoAuto: true },
  { id: "3", nome: "SAP Professional", app: "SAP ERP", total: 100, emUso: 94, modo: "manual", revogacaoAuto: false },
  { id: "4", nome: "GitHub Enterprise", app: "GitHub Enterprise", total: 200, emUso: 142, modo: "automatico", revogacaoAuto: true },
  { id: "5", nome: "Slack Business+", app: "Slack", total: 1000, emUso: 834, modo: "automatico", revogacaoAuto: true },
  { id: "6", nome: "Datadog Pro", app: "Datadog", total: 50, emUso: 48, modo: "sob_demanda", revogacaoAuto: false },
];

function usagePercent(total: number, emUso: number) { return Math.round((emUso / total) * 100); }
function disponivel(total: number, emUso: number) { return total - emUso; }

export default function LicencasPage() {
  const criticos = mockLicencas.filter((l) => usagePercent(l.total, l.emUso) >= 90).length;

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
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Aplicação</th>
          <th className="p-4 font-medium">Total</th><th className="p-4 font-medium">Em uso</th>
          <th className="p-4 font-medium min-w-[180px]">Disponibilidade</th><th className="p-4 font-medium">Modo</th>
          <th className="p-4 font-medium">Revogação auto</th>
        </tr></thead><tbody>
          {mockLicencas.map((l) => {
            const pct = usagePercent(l.total, l.emUso);
            const disp = disponivel(l.total, l.emUso);
            return (
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4"><Link to={`/licencas/${l.id}`} className="font-medium text-primary hover:underline">{l.nome}</Link></td>
                <td className="p-4 text-muted-foreground">{l.app}</td>
                <td className="p-4 text-muted-foreground">{l.total}</td>
                <td className="p-4 text-muted-foreground">{l.emUso}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <Progress value={pct} className={`h-2 flex-1 ${pct >= 90 ? "[&>div]:bg-destructive" : pct >= 75 ? "[&>div]:bg-warning" : ""}`} />
                    <span className={`text-xs font-medium ${pct >= 90 ? "text-destructive" : "text-muted-foreground"}`}>{disp} disp.</span>
                  </div>
                </td>
                <td className="p-4"><Badge variant="outline" className={modoColors[l.modo]}>{l.modo}</Badge></td>
                <td className="p-4 text-muted-foreground">{l.revogacaoAuto ? "✓" : "—"}</td>
              </tr>
            );
          })}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
