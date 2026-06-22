import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState from "@/components/EmptyState";

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
  pre_leaver: "bg-warning text-warning-foreground",
  pre_leaver_revertido: "bg-info text-info-foreground",
};

const tipoJMLLabels: Record<string, string> = {
  joiner: "joiner",
  mover: "mover",
  leaver: "leaver",
  pre_leaver: "pré-leaver",
  pre_leaver_revertido: "reversão",
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  quarentena: "Quarentena",
  executando: "Executando",
  executado: "Executado",
  erro: "Erro",
  cancelado: "Cancelado",
};

interface Props {
  eventos: any[];
}

export default function JMLTimeline({ eventos }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        {eventos.length === 0 ? (
          <EmptyState message="Nenhum evento JML." />
        ) : (
          <div className="relative border-l-2 border-border pl-6 space-y-6">
            {eventos.map((ev) => (
              <div key={ev.id} className="relative">
                <div className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card">
                  <div className={`h-2.5 w-2.5 rounded-full ${
                    ev.tipo === "joiner" ? "bg-success" :
                    ev.tipo === "mover" || ev.tipo === "pre_leaver_revertido" ? "bg-info" :
                    ev.tipo === "pre_leaver" ? "bg-warning" : "bg-destructive"
                  }`} />
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${tipoJMLColors[ev.tipo] || ""} text-[10px] uppercase`}>
                        {tipoJMLLabels[ev.tipo] || ev.tipo}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {statusLabels[ev.status] || ev.status}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      {ev.dados_depois ? JSON.stringify(ev.dados_depois) : ev.dados_antes ? JSON.stringify(ev.dados_antes) : "Evento processado"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-4">
                    {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
