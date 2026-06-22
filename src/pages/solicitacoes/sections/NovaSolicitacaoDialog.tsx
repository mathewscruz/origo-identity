import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import EmptyState from "@/components/EmptyState";
import { AppWindow, KeyRound, Send, Users } from "lucide-react";

interface Resource { id: string; nome: string; owner?: string | null; [k: string]: any }
interface Colab { id: string; nome: string; email?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colabs: Colab[];
  apps: Resource[];
  grupos: Resource[];
  licencas: Resource[];

  solicitanteId: string;
  setSolicitanteId: (v: string) => void;
  selectedApps: string[];
  selectedGrupos: string[];
  selectedLicencas: string[];
  onToggleApp: (id: string) => void;
  onToggleGrupo: (id: string) => void;
  onToggleLicenca: (id: string) => void;
  justificativa: string;
  setJustificativa: (v: string) => void;

  buscaColab: string; setBuscaColab: (v: string) => void;
  buscaApp: string; setBuscaApp: (v: string) => void;
  buscaGrupo: string; setBuscaGrupo: (v: string) => void;
  buscaLicenca: string; setBuscaLicenca: (v: string) => void;

  onSubmit: () => void;
  submitting?: boolean;
}

export default function NovaSolicitacaoDialog(props: Props) {
  const {
    open, onOpenChange, colabs, apps, grupos, licencas,
    solicitanteId, setSolicitanteId,
    selectedApps, selectedGrupos, selectedLicencas,
    onToggleApp, onToggleGrupo, onToggleLicenca,
    justificativa, setJustificativa,
    buscaColab, setBuscaColab,
    buscaApp, setBuscaApp,
    buscaGrupo, setBuscaGrupo,
    buscaLicenca, setBuscaLicenca,
    onSubmit, submitting,
  } = props;

  const filteredColabs = colabs.filter((c) => !buscaColab || c.nome.toLowerCase().includes(buscaColab.toLowerCase()));

  const renderList = (
    items: Resource[], selected: string[], onToggle: (id: string) => void, emptyMsg: string,
  ) => (
    <ScrollArea className="h-36 rounded-md border p-2">
      {items.map((r) => (
        <label key={r.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
          <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => onToggle(r.id)} />
          <span className="text-sm">{r.nome}</span>
          {r.owner && <Badge variant="outline" className="text-xs ml-auto">Owner definido</Badge>}
        </label>
      ))}
      {items.length === 0 && <EmptyState message={emptyMsg} size="sm" />}
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Solicitação de Acesso</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Colaborador</label>
            <Input placeholder="Buscar colaborador..." value={buscaColab} onChange={(e) => setBuscaColab(e.target.value)} className="mb-2" />
            <Select value={solicitanteId} onValueChange={setSolicitanteId}>
              <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
              <SelectContent>
                {filteredColabs.slice(0, 50).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` (${c.email})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <AppWindow className="h-4 w-4" /> Aplicações
              {selectedApps.length > 0 && <Badge variant="secondary" className="text-xs">{selectedApps.length} selecionada(s)</Badge>}
            </label>
            <Input placeholder="Buscar aplicação..." value={buscaApp} onChange={(e) => setBuscaApp(e.target.value)} />
            {renderList(apps, selectedApps, onToggleApp, "Nenhuma aplicação encontrada")}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Grupos
              {selectedGrupos.length > 0 && <Badge variant="secondary" className="text-xs">{selectedGrupos.length} selecionado(s)</Badge>}
            </label>
            <Input placeholder="Buscar grupo..." value={buscaGrupo} onChange={(e) => setBuscaGrupo(e.target.value)} />
            {renderList(grupos, selectedGrupos, onToggleGrupo, "Nenhum grupo encontrado")}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Licenças
              {selectedLicencas.length > 0 && <Badge variant="secondary" className="text-xs">{selectedLicencas.length} selecionada(s)</Badge>}
            </label>
            <Input placeholder="Buscar licença..." value={buscaLicenca} onChange={(e) => setBuscaLicenca(e.target.value)} />
            {renderList(licencas, selectedLicencas, onToggleLicenca, "Nenhuma licença encontrada")}
          </div>

          <div>
            <label className="text-sm font-medium">Justificativa</label>
            <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Explique por que este acesso é necessário..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={submitting}>
            <Send className="mr-2 h-4 w-4" />{submitting ? "Enviando..." : "Enviar Solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
