import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authedFetch } from "@/lib/authedFetch";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Workflow } from "lucide-react";

export type JmlTipo = "joiner" | "mover" | "leaver" | "pre_leaver";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId?: string | null;
  colaboradorNome: string;
  defaultTipo?: JmlTipo;
  /** Restringe os tipos disponíveis (ex.: terceiros podem não ter "mover"). */
  allowedTipos?: JmlTipo[];
}

const tipoLabels: Record<JmlTipo, string> = {
  joiner: "Joiner — Onboarding",
  mover: "Mover — Mudança de função/área",
  leaver: "Leaver — Desligamento",
  pre_leaver: "Pré-Leaver — Suspensão preventiva",
};

const tipoDescriptions: Record<JmlTipo, string> = {
  joiner: "Registra um evento de admissão. O provisionamento real (perfis, grupos, licenças) deve ser feito em Acessos Ativos.",
  mover: "Registra mudança de cargo/área. Após confirmar, ajuste perfis em Acessos Ativos para refletir o novo papel.",
  leaver: "Registra desligamento. Para executar revogações imediatas use também o status 'Desligado'.",
  pre_leaver: "Suspende acessos preventivamente sem desligar. Use o botão 'Suspender Acessos' para executar a suspensão técnica.",
};

export default function StartJmlEventDialog({
  open, onOpenChange, colaboradorId, colaboradorNome,
  defaultTipo = "mover", allowedTipos,
}: Props) {
  const tipos = (allowedTipos ?? (["joiner", "mover", "leaver", "pre_leaver"] as JmlTipo[]));
  const [tipo, setTipo] = useState<JmlTipo>(defaultTipo);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  async function handleSubmit() {
    if (!motivo.trim()) {
      toast.error("Informe um motivo para o evento JML.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-jml-event`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo,
            colaboradorId: colaboradorId ?? null,
            colaboradorNome,
            motivo: motivo.trim(),
            origem: "manual",
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Falha ao iniciar evento JML");
      toast.success("Evento JML registrado", {
        description: (
          <span>
            <Link to={`/eventos-jml/${data.eventoId}`} className="underline">
              Abrir detalhes do evento
            </Link>
          </span>
        ) as unknown as string,
      });
      qc.invalidateQueries({ queryKey: ["eventos_jml"] });
      onOpenChange(false);
      setMotivo("");
    } catch (e) {
      toast.error("Erro ao iniciar evento JML", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            Iniciar evento JML
          </DialogTitle>
          <DialogDescription>
            Registra um evento no ciclo de vida de <span className="font-medium">{colaboradorNome}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tipo de evento</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as JmlTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t} value={t}>{tipoLabels[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{tipoDescriptions[tipo]}</p>
          </div>
          <div>
            <Label>Motivo / contexto</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: Promoção para Coordenador, transferência para área Operações…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !motivo.trim()}>
            {submitting ? "Registrando..." : "Iniciar evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
