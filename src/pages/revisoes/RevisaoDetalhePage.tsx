import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Search, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useRevisao, useRevisaoItens } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/useRole";
import { logAuditoria } from "@/lib/auditLogger";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const decisaoColors: Record<string, string> = {
  manter: "bg-success/15 text-success border-success/30",
  revogar: "bg-destructive/15 text-destructive border-destructive/30",
};

const decisaoLabel: Record<string, string> = {
  manter: "Manter",
  revogar: "Revogar",
};

export default function RevisaoDetalhePage() {
  const { id } = useParams();
  const { data: revisao, isLoading } = useRevisao(id);
  const { data: itens } = useRevisaoItens(id);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"resend" | "finalize" | "cancel" | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = useCanEdit();

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!revisao) return <div className="p-8"><EmptyState message="Revisão não encontrada." size="lg" /></div>;

  const progress = revisao.total_itens > 0 ? (revisao.itens_revisados / revisao.total_itens) * 100 : 0;
  const mantidos = (itens || []).filter((it: any) => it.decisao === "manter").length;
  const revogados = (itens || []).filter((it: any) => it.decisao === "revogar").length;
  const pendentes = (itens || []).filter((it: any) => !it.decisao).length;
  const reviewToken = (revisao as any).token;
  const externalUrl = reviewToken ? `${window.location.origin}/revisao-externa/${reviewToken}` : null;
  const isConcluida = revisao.status === "concluida";
  const isCancelada = revisao.status === "cancelada";
  const isAtiva = !isConcluida && !isCancelada;

  const handleResend = async () => {
    setBusy("resend");
    const { error } = await supabase.functions.invoke("send-review-email", { body: { revisao_id: id } });
    setBusy(null);
    if (error) toast({ title: "Erro ao reenviar", description: error.message, variant: "destructive" });
    else toast({ title: "E-mail reenviado", description: `Notificação enviada para ${revisao.responsavel || "owner"}` });
  };

  const handleFinalize = async () => {
    if (!reviewToken) return;
    setBusy("finalize");
    // Constrói payload de decisões já tomadas
    const decisions: Record<string, string> = {};
    (itens || []).forEach((it: any) => { if (it.decisao) decisions[it.id] = it.decisao; });
    const { data, error } = await supabase.functions.invoke("save-external-review", {
      body: { token: reviewToken, decisions },
    });
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Revisão concluída", description: `${data?.mantidos ?? 0} mantidos, ${data?.revogados ?? 0} revogados.` });
      if ((data?.revogados ?? 0) > 0) triggerEntraProcessing();
      qc.invalidateQueries({ queryKey: ["revisao", id] });
      qc.invalidateQueries({ queryKey: ["revisao_itens", id] });
      qc.invalidateQueries({ queryKey: ["revisoes"] });
    }
  };

  const handleCancel = async () => {
    setBusy("cancel");
    const { error } = await supabase.from("revisoes").update({ status: "cancelada" } as any).eq("id", id!);
    setBusy(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    await logAuditoria({ acao: "cancelar_revisao", entidade: "revisoes", entidade_id: id!, resumo: `Campanha cancelada: ${revisao.nome}` });
    toast({ title: "Campanha cancelada" });
    qc.invalidateQueries({ queryKey: ["revisao", id] });
    qc.invalidateQueries({ queryKey: ["revisoes"] });
  };

  const filteredItens = (itens || []).filter((it: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (it.colaborador_nome || "").toLowerCase().includes(s) || (it.perfil_nome || "").toLowerCase().includes(s);
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/revisoes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{revisao.nome}</h1>
            <Badge variant="outline" className={isConcluida ? "bg-success/15 text-success border-success/30" : isCancelada ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-info/15 text-info border-info/30"}>{({ em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada" } as Record<string, string>)[revisao.status] || revisao.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Responsável: {revisao.responsavel} · {revisao.data_inicio ? new Date(revisao.data_inicio).toLocaleDateString("pt-BR") : ""} → {revisao.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : "sem prazo"}</p>
        </div>
        {externalUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> Link Externo
            </a>
          </Button>
        )}
      </div>

      {/* Action bar */}
      {canEdit && isAtiva && (
        <Card className="border-primary/20"><CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResend} disabled={busy !== null}>
            {busy === "resend" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Reenviar e-mail
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy !== null}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir agora
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir campanha?</AlertDialogTitle>
                <AlertDialogDescription>
                  As decisões já tomadas serão aplicadas: <strong>{mantidos}</strong> mantidos e <strong>{revogados}</strong> revogados serão processados no Entra ID. Itens pendentes ({pendentes}) ficarão sem decisão.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleFinalize}>Concluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy !== null}>
                <XCircle className="h-3 w-3 mr-1" /> Cancelar campanha
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar campanha?</AlertDialogTitle>
                <AlertDialogDescription>
                  A campanha será marcada como cancelada e nenhuma decisão será processada. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">Cancelar campanha</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent></Card>
      )}


      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold">{(itens || []).length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-success">{mantidos}</p>
          <p className="text-xs text-muted-foreground">Mantidos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-destructive">{revogados}</p>
          <p className="text-xs text-muted-foreground">Revogados</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-warning">{pendentes}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </CardContent></Card>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso: {revisao.itens_revisados} de {revisao.total_itens} itens</span>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </CardContent></Card>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Pessoa</th><th className="p-4 font-medium">Perfil</th>
          <th className="p-4 font-medium">Decisão</th><th className="p-4 font-medium">Decidido em</th>
        </tr></thead><tbody>
          {filteredItens.map((it: any) => (
            <tr key={it.id} className="border-b last:border-0">
              <td className="p-4 font-medium text-primary">{it.colaborador_nome || "—"}</td>
              <td className="p-4 text-muted-foreground">{it.perfil_nome || "—"}</td>
              <td className="p-4">
                {it.decisao ? (
                  <Badge variant="outline" className={decisaoColors[it.decisao] || "bg-muted text-muted-foreground"}>{decisaoLabel[it.decisao] || it.decisao}</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">Pendente</Badge>
                )}
              </td>
              <td className="p-4 text-muted-foreground text-xs">{it.decidido_em ? new Date(it.decidido_em).toLocaleString("pt-BR") : "—"}</td>
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
