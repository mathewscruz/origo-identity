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
      const { data: rev, error: revErr } = await (supabase as any)
        .from("revisoes")
        .select("*, aplicacoes(nome)")
        .eq("token", token)
        .single();
      if (revErr || !rev) {
        setError("Revisão não encontrada ou token inválido.");
        setLoading(false);
        return;
      }
      setRevisao(rev);
      if (rev.status === "concluida") {
        setCompleted(true);
      }
      const { data: items } = await supabase
        .from("revisao_itens")
        .select("*")
        .eq("revisao_id", rev.id);
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
    const now = new Date().toISOString();
    let mantidos = 0;
    let revogados = 0;

    for (const item of itens) {
      const decisao = decisions[item.id];
      if (!decisao) continue;
      await supabase
        .from("revisao_itens")
        .update({ decisao, decidido_em: now })
        .eq("id", item.id);
      if (decisao === "manter") mantidos++;
      if (decisao === "revogar") revogados++;

      if (decisao === "revogar" && item.colaborador_id && item.perfil_id) {
        await supabase.from("perfil_atribuicoes").update({
          ativo: false,
          data_revogacao: now,
        }).eq("colaborador_id", item.colaborador_id).eq("perfil_id", item.perfil_id).eq("ativo", true);

        const { data: colab } = await (supabase as any).from("colaboradores").select("sam_account_name, nome, email").eq("id", item.colaborador_id).single();
        const sam = colab?.sam_account_name || "";
        if (sam) {
          // Remove groups
          const { data: grupos } = await supabase.from("perfil_grupos").select("*, entra_grupos(nome, entra_id)").eq("perfil_id", item.perfil_id);
          for (const g of (grupos || [])) {
            await supabase.from("iam_queue" as any).insert({
              action_type: "remove_group",
              payload_json: { samAccountName: sam, displayName: colab?.nome || item.colaborador_nome || "", groupName: g.entra_grupos?.nome || "", groupId: g.entra_grupos?.entra_id || "" },
              target_identity: sam, requested_by: revisao.owner_email || "revisao_externa", colaborador_id: item.colaborador_id, status: "pending",
            });
          }
          // Remove licenses
          const { data: licencas } = await supabase.from("perfil_licencas").select("*, entra_licencas(nome, sku_id)").eq("perfil_id", item.perfil_id);
          for (const l of (licencas || [])) {
            await supabase.from("iam_queue" as any).insert({
              action_type: "remove_license",
              payload_json: { samAccountName: sam, displayName: colab?.nome || item.colaborador_nome || "", licenseName: l.entra_licencas?.nome || "", skuId: l.entra_licencas?.sku_id || "" },
              target_identity: sam, requested_by: revisao.owner_email || "revisao_externa", colaborador_id: item.colaborador_id, status: "pending",
            });
          }
          // Remove apps
          const { data: apps } = await supabase.from("perfil_aplicacoes").select("*, aplicacoes(nome, entra_id)").eq("perfil_id", item.perfil_id);
          for (const a of (apps || [])) {
            if (a.aplicacoes?.entra_id) {
              await supabase.from("iam_queue" as any).insert({
                action_type: "remove_app",
                payload_json: { samAccountName: sam, displayName: colab?.nome || item.colaborador_nome || "", appName: a.aplicacoes?.nome || "", appId: a.aplicacoes?.entra_id || "", userEmail: colab?.email || "" },
                target_identity: sam, requested_by: revisao.owner_email || "revisao_externa", colaborador_id: item.colaborador_id, status: "pending",
              });
            }
          }
        }
      }
    }

    // Mark review as completed
    const revisados = Object.keys(decisions).length;
    await supabase.from("revisoes").update({
      itens_revisados: revisados,
      status: "concluida" as any,
    }).eq("id", revisao.id);

    // Audit
    await supabase.from("auditoria").insert({
      entidade: "revisao",
      entidade_id: revisao.id,
      acao: "revisao_externa",
      operador: revisao.owner_email || "owner",
      resumo: `Revisão externa concluída: ${mantidos} mantidos, ${revogados} revogados`,
      detalhes: { mantidos, revogados, total: itens.length, decisoes: decisions },
    });

    setCompleted(true);
    toast({ title: "Revisão salva com sucesso", description: `${mantidos} mantidos, ${revogados} revogados.` });
    setSaving(false);
    if (revogados > 0) triggerEntraProcessing();
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="flex items-center justify-center min-h-screen"><Card className="max-w-md"><CardContent className="pt-6 text-center"><p className="text-muted-foreground">{error}</p></CardContent></Card></div>;

  const appName = (revisao as any)?.aplicacoes?.nome || "Aplicação";
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
              {completed ? (
                <span className="text-success font-medium">✓ Esta revisão foi concluída. Os resultados estão registrados abaixo.</span>
              ) : (
                <>Revise cada acesso abaixo e decida manter ou revogar. {dataFim && <span className="font-medium">Data limite: {dataFim}</span>}</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-5 pb-4 text-center">
            <p className="text-2xl font-bold">{itens.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
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

        {/* Toolbar */}
        {!completed && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => bulkDecision("manter")}>
              <CheckSquare className="h-3 w-3 mr-1" /> Manter {selected.size > 0 ? `(${selected.size})` : "Todos"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkDecision("revogar")} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <XSquare className="h-3 w-3 mr-1" /> Revogar {selected.size > 0 ? `(${selected.size})` : "Todos"}
            </Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {!completed && (
                    <th className="p-4 w-10">
                      <Checkbox checked={selected.size === filteredItens.length && filteredItens.length > 0} onCheckedChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="p-4 font-medium">Pessoa</th>
                  <th className="p-4 font-medium">Perfil</th>
                  <th className="p-4 font-medium text-center">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {filteredItens.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    {!completed && (
                      <td className="p-4">
                        <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleSelect(it.id)} />
                      </td>
                    )}
                    <td className="p-4 font-medium">{it.colaborador_nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{it.perfil_nome || "—"}</td>
                    <td className="p-4">
                      {completed ? (
                        <div className="flex justify-center">
                          {decisions[it.id] === "manter" && <Badge variant="outline" className="bg-success/15 text-success border-success/30">Mantido</Badge>}
                          {decisions[it.id] === "revogar" && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Revogado</Badge>}
                          {!decisions[it.id] && <Badge variant="outline" className="bg-muted text-muted-foreground">Pendente</Badge>}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant={decisions[it.id] === "manter" ? "default" : "outline"}
                            size="sm"
                            className={decisions[it.id] === "manter" ? "bg-success hover:bg-success/90 text-success-foreground" : ""}
                            onClick={() => setDecision(it.id, "manter")}
                          >
                            <Check className="h-3 w-3 mr-1" /> Manter
                          </Button>
                          <Button
                            variant={decisions[it.id] === "revogar" ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => setDecision(it.id, "revogar")}
                          >
                            <X className="h-3 w-3 mr-1" /> Revogar
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Footer */}
        {!completed && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {Object.keys(decisions).length} de {itens.length} decididos
              {revogarCount > 0 && <span className="text-destructive font-medium ml-2">({revogarCount} revogações)</span>}
            </p>
            <Button onClick={() => setConfirmOpen(true)} disabled={!allDecided || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Revisão
            </Button>
          </div>
        )}

        {/* Confirmation dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Revisão</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a salvar a revisão de acesso para <strong>{appName}</strong>.<br /><br />
                <span className="text-success font-medium">{manterCount} acessos serão mantidos</span><br />
                {revogarCount > 0 && <span className="text-destructive font-medium">{revogarCount} acessos serão revogados (remoção automática no Entra ID)</span>}
                <br /><br />
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleSave}>Confirmar e Salvar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
