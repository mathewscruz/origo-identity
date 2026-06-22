import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import EmptyState from "@/components/EmptyState";

export const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Processando", class: "bg-info/15 text-info border-info/30" },
  success: { label: "Concluído", class: "bg-success/15 text-success border-success/30" },
  failed: { label: "Falhou", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

export const actionConfig: Record<string, { label: string; class: string }> = {
  create: { label: "Criação", class: "bg-success/15 text-success border-success/30" },
  create_if_not_exists: { label: "Criação (Auto)", class: "bg-success/15 text-success border-success/30" },
  update: { label: "Atualização", class: "bg-info/15 text-info border-info/30" },
  disable: { label: "Desativação", class: "bg-warning/15 text-warning border-warning/30" },
  delete: { label: "Exclusão", class: "bg-destructive/15 text-destructive border-destructive/30" },
  assign_group: { label: "Atribuir Grupo", class: "bg-primary/15 text-primary border-primary/30" },
  remove_group: { label: "Remover Grupo", class: "bg-muted text-muted-foreground border-muted" },
  assign_license: { label: "Atribuir Licença", class: "bg-primary/15 text-primary border-primary/30" },
  remove_license: { label: "Remover Licença", class: "bg-muted text-muted-foreground border-muted" },
  assign_app: { label: "Atribuir App", class: "bg-primary/15 text-primary border-primary/30" },
  remove_app: { label: "Remover App", class: "bg-muted text-muted-foreground border-muted" },
  disable_entra: { label: "Desativar Entra", class: "bg-warning/15 text-warning border-warning/30" },
  enable_entra: { label: "Reativar Entra", class: "bg-success/15 text-success border-success/30" },
  update_entra: { label: "Atualizar Entra", class: "bg-info/15 text-info border-info/30" },
};

export interface QueueItem {
  id: string;
  action_type: string;
  status: string;
  payload_json: any;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
  result_message: string | null;
  correlation_id: string;
  colaborador_id: string | null;
  retry_count: number;
  max_retries: number;
}

interface Props {
  items: QueueItem[];
  loading: boolean;
}

export default function QueueTable({ items, loading }: Props) {
  return (
    <Card data-tour="table">
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="p-4 font-medium hidden lg:table-cell">Correlation ID</th>
                  <th className="p-4 font-medium">Ação</th>
                  <th className="p-4 font-medium">Usuário</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium hidden md:table-cell">Solicitante</th>
                  <th className="p-4 font-medium hidden md:table-cell">Solicitado em</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Processado em</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Retries</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const aCfg = actionConfig[item.action_type] || { label: item.action_type, class: "" };
                  const sCfg = statusConfig[item.status] || { label: item.status, class: "" };
                  const displayName = item.payload_json?.displayName || item.payload_json?.samAccountName || "—";
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 hidden lg:table-cell">
                        <Link to={`/fila-provisionamento/${item.id}`} className="font-mono text-xs text-primary hover:underline">
                          {item.correlation_id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="p-4"><Badge variant="outline" className={aCfg.class}>{aCfg.label}</Badge></td>
                      <td className="p-4 font-medium">{displayName}</td>
                      <td className="p-4"><Badge variant="outline" className={sCfg.class}>{sCfg.label}</Badge></td>
                      <td className="p-4 text-muted-foreground text-xs hidden md:table-cell">{item.requested_by || "—"}</td>
                      <td className="p-4 text-muted-foreground text-xs hidden md:table-cell">{format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</td>
                      <td className="p-4 text-muted-foreground text-xs hidden lg:table-cell">{item.processed_at ? format(new Date(item.processed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</td>
                      <td className="p-4 text-xs text-muted-foreground hidden lg:table-cell">
                        {item.retry_count > 0 ? (
                          <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">{item.retry_count}/{item.max_retries || 10}</Badge>
                        ) : "—"}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">{item.result_message || "—"}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={9}><EmptyState message="Nenhuma solicitação encontrada." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
