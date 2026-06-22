import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import EmptyState from "@/components/EmptyState";

const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};
const jmlStatusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};
const statusLabels: Record<string, string> = {
  pendente: "Pendente", quarentena: "Quarentena", executando: "Executando",
  executado: "Executado", erro: "Erro", cancelado: "Cancelado",
};

interface Props {
  items: any[];
  loading: boolean;
}

export default function EventosJMLTable({ items, loading }: Props) {
  return (
    <Card><CardContent className="p-0">
      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Tipo</th>
            <th className="p-4 font-medium">Pessoa</th>
            <th className="p-4 font-medium">Status</th>
            <th className="p-4 font-medium">Tentativas</th>
            <th className="p-4 font-medium">Data</th>
          </tr></thead>
          <tbody>
            {items.map((ev: any) => (
              <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4"><Badge className={`${tipoColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo.charAt(0)}</Badge></td>
                <td className="p-4"><Link to={`/eventos-jml/${ev.id}`} className="font-medium text-primary hover:underline">{ev.colaborador_nome || "Desconhecido"}</Link></td>
                <td className="p-4"><Badge variant="outline" className={jmlStatusColors[ev.status] || ""}>{statusLabels[ev.status] || ev.status}</Badge></td>
                <td className="p-4 text-muted-foreground">{ev.tentativas}/{ev.max_tentativas}</td>
                <td className="p-4 text-muted-foreground text-xs">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5}><EmptyState message="Nenhum evento." /></td></tr>}
          </tbody>
        </table>
      )}
    </CardContent></Card>
  );
}
