import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Search, CheckSquare, XSquare, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RevisaoItem {
  id: string;
  colaborador_nome: string | null;
  perfil_nome: string | null;
  decisao: string | null;
  colaborador_id: string | null;
  perfil_id: string | null;
}

export default function RevisaoExternaPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [revisao, setRevisao] = useState<any>(null);
  const [itens, setItens] = useState<RevisaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      // Use RPC functions for token-based access (no anon RLS needed)
      const { data: rev, error: revErr } = await supabase.rpc("get_revisao_by_token" as any, { p_token: token });
      if (revErr || !rev) {
        setError("Revisão não encontrada ou token inválido.");
        setLoading(false);
        return;
      }
      setRevisao(rev);
      if (rev.status === "concluida") {
        setCompleted(true);
      }
      const { data: items } = await supabase.rpc("get_revisao_itens_by_token" as any, { p_token: token });
      setItens(items || []);
      const existing: Record<string, string> = {};
      (items || []).forEach((it: any) => { if (it.decisao) existing[it.id] = it.decisao; });
      setDecisions(existing);
      setLoading(false);
    })();
  }, [token]);

  const setDecision = (itemId: string, decisao: string) => {
    if (completed) return;
    setDecisions((prev) => ({ ...prev, [itemId]: decisao }));
  };

  const filteredItens = itens.filter((it) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (it.colaborador_nome || "").toLowerCase().includes(s) || (it.perfil_nome || "").toLowerCase().includes(s);
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredItens.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItens.map((it) => it.id)));
    }
  };

  const bulkDecision = (decisao: string) => {
    if (completed) return;
    const targets = selected.size > 0 ? selected : new Set(filteredItens.map((it) => it.id));
    setDecisions((prev) => {
      const next = { ...prev };
      targets.forEach((id) => { next[id] = decisao; });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      // Call edge function to save decisions securely (uses service_role)
      const { data, error: fnError } = await supabase.functions.invoke("save-external-review", {
        body: { token, decisions },
      });

      if (fnError) throw fnError;

      const mantidos = data?.mantidos ?? 0;
      const revogados = data?.revogados ?? 0;

      setCompleted(true);
      toast({ title: "Revisão salva com sucesso", description: `${mantidos} mantidos, ${revogados} revogados.` });

      if (revogados > 0) triggerEntraProcessing();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
    }

    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="flex items-center justify-center min-h-screen"><Card className="max-w-md"><CardContent className="pt-6 text-center"><p className="text-muted-foreground">{error}</p></CardContent></Card></div>;

  const appName = revisao?.aplicacoes?.nome || revisao?.nome || "Revisão de Acesso";
  const allDecided = itens.length > 0 && itens.every((it) => decisions[it.id]);
  const revogarCount = Object.values(decisions).filter((d) => d === "revogar").length;
  const manterCount = Object.values(decisions).filter((d) => d === "manter").length;
  const dataFim = revisao?.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header with branding */}
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Origo Identity · Revisão de Acesso</p>
                <CardTitle className="text-xl">{appName}</CardTitle>
              </div>
            </div>
            <CardDescription>
              Revise os acessos abaixo e decida manter ou revogar cada um.
              {dataFim && <span className="ml-1">Prazo: <strong>{dataFim}</strong></span>}
            </CardDescription>
          </CardHeader>
        </Card>

        {completed && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="pt-6 text-center">
              <Check className="h-8 w-8 text-success mx-auto mb-2" />
              <p className="font-medium text-success">Revisão concluída com sucesso!</p>
              <p className="text-sm text-muted-foreground mt-1">Obrigado pela sua análise. Ações de revogação serão processadas automaticamente.</p>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-bold">{itens.length}</p>
            <p className="text-xs text-muted-foreground">Total de Acessos</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-bold text-success">{manterCount}</p>
            <p className="text-xs text-muted-foreground">Manter</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-bold text-destructive">{revogarCount}</p>
            <p className="text-xs text-muted-foreground">Revogar</p>
          </CardContent></Card>
        </div>

        {!completed && (
          <>
            {/* Bulk actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                <CheckSquare className="h-3 w-3 mr-1" />
                {selected.size === filteredItens.length ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkDecision("manter")} className="text-success border-success/30 hover:bg-success/10">
                <Check className="h-3 w-3 mr-1" /> Manter {selected.size > 0 ? `(${selected.size})` : "Todos"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkDecision("revogar")} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <X className="h-3 w-3 mr-1" /> Revogar {selected.size > 0 ? `(${selected.size})` : "Todos"}
              </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </>
        )}

        {/* Items */}
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {!completed && <th className="p-4 w-10"><Checkbox checked={selected.size === filteredItens.length && filteredItens.length > 0} onCheckedChange={toggleSelectAll} /></th>}
                <th className="p-4 font-medium">Pessoa</th>
                <th className="p-4 font-medium">Perfil de Acesso</th>
                <th className="p-4 font-medium text-center">Decisão</th>
              </tr>
            </thead>
            <tbody>
              {filteredItens.map((it) => {
                const dec = decisions[it.id];
                return (
                  <tr key={it.id} className="border-b last:border-0 hover:bg-muted/50">
                    {!completed && (
                      <td className="p-4"><Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleSelect(it.id)} /></td>
                    )}
                    <td className="p-4 font-medium">{it.colaborador_nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{it.perfil_nome || "—"}</td>
                    <td className="p-4">
                      {completed ? (
                        <div className="flex justify-center">
                          {dec === "manter" && <Badge variant="outline" className="bg-success/15 text-success border-success/30">Manter</Badge>}
                          {dec === "revogar" && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Revogar</Badge>}
                          {!dec && <Badge variant="outline" className="bg-muted text-muted-foreground">Pendente</Badge>}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant={dec === "manter" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDecision(it.id, "manter")}
                            className={dec === "manter" ? "bg-success hover:bg-success/90 text-white" : "text-success border-success/30 hover:bg-success/10"}
                          >
                            <Check className="h-3 w-3 mr-1" /> Manter
                          </Button>
                          <Button
                            variant={dec === "revogar" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDecision(it.id, "revogar")}
                            className={dec === "revogar" ? "bg-destructive hover:bg-destructive/90 text-white" : "text-destructive border-destructive/30 hover:bg-destructive/10"}
                          >
                            <X className="h-3 w-3 mr-1" /> Revogar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent></Card>

        {/* Submit */}
        {!completed && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {Object.keys(decisions).length} de {itens.length} itens decididos
            </p>
            <Button
              onClick={() => { if (revogarCount > 0) setConfirmOpen(true); else handleSave(); }}
              disabled={!allDecided || saving}
              size="lg"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar Revisão
            </Button>
          </div>
        )}

        {/* Confirmation dialog for revocations */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Revogações</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a revogar <strong>{revogarCount}</strong> acesso(s). Esta ação será processada automaticamente e não pode ser desfeita facilmente. Deseja continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setConfirmOpen(false); handleSave(); }} className="bg-destructive hover:bg-destructive/90">
                Confirmar Revogações
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
