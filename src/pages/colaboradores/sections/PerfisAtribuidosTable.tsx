import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import EmptyState from "@/components/EmptyState";

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
  cargo: "bg-info/15 text-info border-info/30",
};

const origemLabels: Record<string, string> = {
  regra: "Regra",
  excecao: "Exceção",
  manual: "Manual",
  cargo: "Cargo",
};

interface Props {
  atribuicoes: any[] | undefined;
  getPerfilApps: (a: any) => string[];
  onRevoke: (atribuicaoId: string, perfilId?: string) => void;
}

export default function PerfisAtribuidosTable({ atribuicoes, getPerfilApps, onRevoke }: Props) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">Perfis de Acesso</h3>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Perfil</th>
                <th className="p-4 font-medium">Aplicações</th>
                <th className="p-4 font-medium">Origem</th>
                <th className="p-4 font-medium">Desde</th>
                <th className="p-4 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {(atribuicoes ?? []).map((a) => {
                const apps = getPerfilApps(a);
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{(a.perfis_acesso as any)?.nome || "—"}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {apps.length > 0 ? apps.map((name: string) => (
                          <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                        )) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className={origemColors[a.origem || "manual"]}>
                        {origemLabels[a.origem || "manual"] || a.origem}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{new Date(a.data_concessao).toLocaleDateString("pt-BR")}</td>
                    <td className="p-4">
                      <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => onRevoke(a.id, a.perfil_id)}>
                        <XCircle className="mr-1 h-3 w-3" /> Revogar
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {(!atribuicoes || atribuicoes.length === 0) && (
                <tr><td colSpan={5}><EmptyState message="Nenhum perfil atribuído." /></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
