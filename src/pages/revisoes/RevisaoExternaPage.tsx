import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, CheckSquare, Loader2, Search, Shield, X, Bot, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@/assets/logo.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Página pública (link com token): o owner/gestor decide quem mantém e quem perde cada acesso. */
export default function RevisaoExternaPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [revisao, setRevisao] = useState<Row>(null);
  const [itens, setItens] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [justif, setJustif] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [result, setResult] = useState<Row>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: rev, error: revErr } = await supabase.rpc("get_revisao_by_token" as never, { p_token: token } as never);
      if (revErr || !rev) { setError("Revisão não encontrada, já encerrada ou link expirado. Peça um novo link ao time de IAM."); setLoading(false); return; }
      const r = rev as Row;
      setRevisao(r);
      if (r.status !== "em_andamento") setCompleted(true);
      const { data: items } = await supabase.rpc("get_revisao_itens_by_token" as never, { p_token: token } as never);
      const list = ((items as Row[]) || []).sort((a, b) => (a.colaborador_nome || "").localeCompare(b.colaborador_nome || ""));
      setItens(list);
      const existing: Record<string, string> = {}; const j: Record<string, string> = {};
      list.forEach((it) => { if (it.decisao) existing[it.id] = it.decisao; if (it.justificativa) j[it.id] = it.justificativa; });
      setDecisions(existing); setJustif(j);
      setLoading(false);
    })();
  }, [token]);

  const filtered = useMemo(() => itens.filter((it) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [it.colaborador_nome, it.perfil_nome, it.recurso_nome, it.cargo_nome, it.area_nome].some((v) => (v || "").toLowerCase().includes(s));
  }), [itens, search]);

  const setDecision = (id: string, d: string) => { if (!completed) setDecisions((p) => ({ ...p, [id]: d })); };
  const bulk = (d: string) => { if (completed) return; const targets = selected.size ? selected : new Set(filtered.map((it) => it.id)); setDecisions((p) => { const n = { ...p }; targets.forEach((id) => { n[id] = d; }); return n; }); setSelected(new Set()); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error: fnError } = await invokeFunction("save-external-review", { token, decisions, justificativas: justif });
      if (fnError) throw new Error(fnError);
      setResult(data); setCompleted(true);
      toast({ title: "Revisão enviada", description: `${data?.mantidos ?? 0} mantidos · ${data?.revogados ?? 0} revogados` });
    } catch (err: Row) {
      toast({ title: "Erro ao enviar", description: err?.message || "Tente novamente.", variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="max-w-md"><CardContent className="pt-6 text-center"><Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-muted-foreground">{error}</p></CardContent></Card></div>;

  const isGestor = revisao?.tipo === "gestor";
  const isTerc = revisao?.tipo === "terceiros";
  const REVOGAR = isTerc ? "Desligar" : "Revogar";
  const title = revisao?.nome || (isTerc ? "Revalidação de terceiros" : "Revisão de acesso");
  const decidedCount = itens.filter((it) => decisions[it.id]).length;
  const allDecided = itens.length > 0 && decidedCount === itens.length;
  const revogar = itens.filter((it) => decisions[it.id] === "revogar").length;
  const manter = itens.filter((it) => decisions[it.id] === "manter").length;
  const dataFim = revisao?.data_fim ? new Date(revisao.data_fim + "T12:00:00").toLocaleDateString("pt-BR") : null;
  const late = revisao?.data_fim && revisao.data_fim < new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <img src={logoImg} alt="Órigo" className="h-9 w-9 rounded-lg object-contain" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Órigo Access & Identity · {isTerc ? "Revalidação de terceiros" : "Revisão de acesso"}</p>
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          </div>
          {dataFim && <Badge variant="outline" className={`ml-auto gap-1 ${late ? "border-destructive/30 bg-destructive/10 text-destructive" : ""}`}><CalendarClock className="h-3 w-3" />Prazo {dataFim}</Badge>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-6">
        {completed ? (
          <Card className="border-success/30 bg-success/5"><CardContent className="pt-6 text-center">
            <Check className="mx-auto mb-2 h-8 w-8 text-success" />
            <p className="font-medium text-success">{isTerc ? "Revalidação" : "Revisão"} {revisao?.status === "cancelada" ? "cancelada" : "concluída"}. Obrigado!</p>
            <p className="mt-1 text-sm text-muted-foreground">{result ? (isTerc ? `${result.mantidos} mantido(s) · ${result.revogados} desligado(s) · ${result.acoes} ação(ões) já em execução pelo agente.` : `${result.mantidos} mantidos · ${result.revogados} revogados · ${result.acoes} remoção(ões) já em execução pelo agente.`) : "As decisões desta campanha já foram registradas."}</p>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="space-y-2 pt-5 text-sm">
            <p>{isTerc ? <>Você é o responsável pelos terceiros abaixo. Para cada um, confirme se o acesso continua necessário (<strong>Manter</strong>) ou se deve ser encerrado (<strong>Desligar</strong>).</> : isGestor ? <>Você é o gestor desta equipe. Para cada acesso abaixo, decida se a pessoa <strong>mantém</strong> ou <strong>perde</strong> o acesso.</> : <>Você é o responsável por esta aplicação. Para cada pessoa, decida se ela <strong>mantém</strong> ou <strong>perde</strong> o acesso.</>}</p>
            <p className="flex items-start gap-2 text-muted-foreground"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{isTerc ? <>Ao enviar, os desligamentos são executados automaticamente pelo Órigo Agente (contas desabilitadas e acessos removidos). <strong className="text-foreground">Sem resposta até {dataFim || "o prazo"}, todos os terceiros desta lista são desativados.</strong></> : <>Ao enviar, as revogações são executadas automaticamente pelo Órigo Agente — não há outra etapa de aprovação. Em dúvida, mantenha e registre o motivo.</>}</p>
          </CardContent></Card>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pb-4 pt-5 text-center"><p className="text-2xl font-bold">{itens.length}</p><p className="text-xs text-muted-foreground">{isTerc ? "Terceiros" : "Acessos"}</p></CardContent></Card>
          <Card><CardContent className="pb-4 pt-5 text-center"><p className="text-2xl font-bold text-success">{manter}</p><p className="text-xs text-muted-foreground">Manter</p></CardContent></Card>
          <Card><CardContent className="pb-4 pt-5 text-center"><p className="text-2xl font-bold text-destructive">{revogar}</p><p className="text-xs text-muted-foreground">{REVOGAR}</p></CardContent></Card>
        </div>
        {!completed && <Progress value={itens.length ? (decidedCount / itens.length) * 100 : 0} className="h-2" />}

        {!completed && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={isTerc ? "Buscar terceiro ou empresa…" : "Buscar pessoa, perfil, cargo…"} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
            <Button variant="outline" size="sm" onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((it) => it.id)))}><CheckSquare className="mr-1 h-3 w-3" />{selected.size === filtered.length && filtered.length > 0 ? "Desmarcar" : "Selecionar todos"}</Button>
            <Button variant="outline" size="sm" onClick={() => bulk("manter")} className="border-success/30 text-success hover:bg-success/10"><Check className="mr-1 h-3 w-3" />Manter {selected.size ? `(${selected.size})` : "todos"}</Button>
            <Button variant="outline" size="sm" onClick={() => bulk("revogar")} className="border-destructive/30 text-destructive hover:bg-destructive/10"><X className="mr-1 h-3 w-3" />{REVOGAR} {selected.size ? `(${selected.size})` : "todos"}</Button>
          </div>
        )}

        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            {!completed && <th className="w-8 p-3"><Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((it) => it.id)))} /></th>}
            <th className="p-3 font-medium">{isTerc ? "Terceiro" : "Pessoa"}</th><th className="p-3 font-medium">{isTerc ? "Situação" : "Acesso"}</th><th className="p-3 text-center font-medium">Decisão</th>
          </tr></thead><tbody>
            {filtered.map((it) => {
              const dec = decisions[it.id];
              return (
                <tr key={it.id} className={`border-b last:border-0 ${dec === "revogar" ? "bg-destructive/5" : dec === "manter" ? "bg-success/5" : ""}`}>
                  {!completed && <td className="p-3"><Checkbox checked={selected.has(it.id)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} /></td>}
                  <td className="p-3"><div className="font-medium">{it.colaborador_nome || "—"}</div><div className="text-[11px] text-muted-foreground">{[it.cargo_nome, it.area_nome].filter(Boolean).join(" · ")}{it.terceiro_id ? " · Terceiro" : ""}</div></td>
                  <td className="p-3"><div>{it.recurso_nome || it.perfil_nome || "—"}</div><div className="text-[11px] text-muted-foreground">{it.tipo === "terceiro" ? "Acesso de terceiro" : it.tipo === "individual" ? "Acesso direto" : "Perfil de acesso"}{it.origem === "cargo" ? " · pelo cargo" : it.origem === "excecao" ? " · por exceção" : ""}</div></td>
                  <td className="p-3">
                    {completed ? (
                      <div className="flex justify-center">{dec === "manter" ? <Badge variant="outline" className="border-success/30 bg-success/15 text-success">Manter</Badge> : dec === "revogar" ? <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">{REVOGAR}</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">Sem decisão</Badge>}</div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex gap-1">
                          <Button size="sm" variant={dec === "manter" ? "default" : "outline"} onClick={() => setDecision(it.id, "manter")} className={dec === "manter" ? "bg-success text-white hover:bg-success/90" : "border-success/30 text-success hover:bg-success/10"}><Check className="mr-1 h-3 w-3" />Manter</Button>
                          <Button size="sm" variant={dec === "revogar" ? "default" : "outline"} onClick={() => setDecision(it.id, "revogar")} className={dec === "revogar" ? "bg-destructive text-white hover:bg-destructive/90" : "border-destructive/30 text-destructive hover:bg-destructive/10"}><X className="mr-1 h-3 w-3" />{REVOGAR}</Button>
                        </div>
                        {dec === "revogar" && <Input className="h-7 w-full max-w-[260px] text-xs" placeholder="Motivo (opcional)" value={justif[it.id] || ""} onChange={(e) => setJustif((j) => ({ ...j, [it.id]: e.target.value }))} />}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div></CardContent></Card>

        {!completed && (
          <div className="sticky bottom-4 flex items-center justify-between rounded-lg border bg-card p-3 shadow-lg">
            <p className="text-sm text-muted-foreground">{decidedCount} de {itens.length} decididos{!allDecided && " — decida todos para enviar"}</p>
            <Button size="lg" onClick={() => (revogar > 0 ? setConfirmOpen(true) : handleSave())} disabled={!allDecided || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar revisão</Button>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isTerc ? `Confirmar ${revogar} desligamento(s)?` : `Confirmar ${revogar} revogação(ões)?`}</AlertDialogTitle>
              <AlertDialogDescription>{isTerc ? "Os terceiros marcados como \"Desligar\" terão as contas desabilitadas e os acessos removidos automaticamente pelo Órigo Agente logo após o envio. Esta decisão fica registrada em seu nome." : "Os acessos marcados como \"revogar\" serão removidos automaticamente pelo Órigo Agente logo após o envio. Esta decisão fica registrada em seu nome."}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={() => { setConfirmOpen(false); handleSave(); }} className="bg-destructive hover:bg-destructive/90">Confirmar e enviar</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="pb-6 text-center text-[11px] text-muted-foreground">Órigo Access & Identity — este link é pessoal{dataFim ? ` e vale até ${dataFim}` : " e expira em 30 dias"}.</p>
      </main>
    </div>
  );
}
