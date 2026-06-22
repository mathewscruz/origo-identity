import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AppWindow, Users, KeyRound, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface Item {
  id: string;
  tipo: "app" | "grupo" | "licenca";
  recurso_nome: string;
  status: "pendente" | "aprovado" | "rejeitado";
  owner_email: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
}

interface Props {
  solicitacao: { id: string; created_at: string; justificativa: string };
  items: Item[];
}

const iconMap = { app: AppWindow, grupo: Users, licenca: KeyRound } as const;
const statusIconMap = { pendente: Clock, aprovado: CheckCircle2, rejeitado: XCircle } as const;
const statusColorMap = {
  pendente: "text-warning",
  aprovado: "text-success",
  rejeitado: "text-destructive",
} as const;

export default function RequestApprovalCard({ solicitacao, items }: Props) {
  const total = items.length;
  const done = items.filter((i) => i.status !== "pendente").length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{solicitacao.justificativa}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enviada em {format(new Date(solicitacao.created_at), "dd/MM/yyyy 'às' HH:mm")} · {done}/{total} itens decididos
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-semibold text-primary">{progress}%</p>
          </div>
        </div>

        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="space-y-1.5 pt-1">
          {items.map((it) => {
            const TipoIcon = iconMap[it.tipo];
            const StatusIcon = statusIconMap[it.status];
            return (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <TipoIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{it.recurso_nome}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                  {it.owner_email || "Auto"}
                </span>
                <Badge variant="outline" className={`text-xs gap-1 ${statusColorMap[it.status]}`}>
                  <StatusIcon className="h-3 w-3" />
                  {it.status === "pendente" ? "Aguardando" : it.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
