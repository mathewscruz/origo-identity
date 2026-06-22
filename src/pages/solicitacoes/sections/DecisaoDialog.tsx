import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AppWindow, CheckCircle2, KeyRound, Users, XCircle } from "lucide-react";

interface Item { id: string; tipo: "app" | "grupo" | "licenca"; recurso_nome: string }
interface Solicitacao { id: string; solicitante_id: string; justificativa: string }

interface Props {
  open: boolean;
  onClose: () => void;
  solicitacao: Solicitacao | null;
  solicitanteNome: string;
  itens: Item[];
  comentario: string;
  setComentario: (v: string) => void;
  onDecision: (d: "aprovada" | "rejeitada") => void;
  submitting?: boolean;
}

const iconMap = { app: AppWindow, grupo: Users, licenca: KeyRound } as const;
const tipoLabel: Record<string, string> = { app: "Aplicação", grupo: "Grupo", licenca: "Licença" };

export default function DecisaoDialog({
  open, onClose, solicitacao, solicitanteNome, itens, comentario, setComentario, onDecision, submitting,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Decidir Solicitação</DialogTitle>
        </DialogHeader>
        {solicitacao && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-1 text-sm">
              <p><strong>Solicitante:</strong> {solicitanteNome}</p>
              <p><strong>Justificativa:</strong> {solicitacao.justificativa}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Itens pendentes de aprovação:</p>
              {itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item pendente</p>
              ) : (
                <div className="space-y-1">
                  {itens.map((item) => {
                    const Icon = iconMap[item.tipo] || AppWindow;
                    return (
                      <div key={item.id} className="flex items-center gap-2 p-2 rounded border">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{item.recurso_nome}</span>
                        <Badge variant="outline" className="text-xs ml-auto">{tipoLabel[item.tipo] || item.tipo}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Comentário (opcional)</label>
              <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Adicione um comentário sobre a decisão..." />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => onDecision("rejeitada")} disabled={itens.length === 0 || submitting}>
            <XCircle className="mr-2 h-4 w-4" />Rejeitar Todos
          </Button>
          <Button onClick={() => onDecision("aprovada")} disabled={itens.length === 0 || submitting}>
            <CheckCircle2 className="mr-2 h-4 w-4" />Aprovar Todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
