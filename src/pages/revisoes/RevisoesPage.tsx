import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { useRevisoes, useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  em_andamento: "bg-info/15 text-info border-info/30",
  concluida: "bg-success/15 text-success border-success/30",
  cancelada: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function RevisoesPage() {
  const { data: revisoes, isLoading } = useRevisoes();
  const { data: aplicacoes } = useAplicacoes();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState("");
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (revisoes ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const handleNovaCampanha = async () => {
    if (!selectedApp) return;
    setCreating(true);

    const app = (aplicacoes || []).find((a: any) => a.id === selectedApp) as any;
    if (!app) { setCreating(false); return; }

    const token = crypto.randomUUID();

    // Create revisao
    const { data: revisao, error } = await (supabase as any)
      .from("revisoes")
      .insert({
        nome: `Revisão — ${app.nome}`,
        status: "em_andamento",
        data_inicio: new Date().toISOString(),
        responsavel: app.owner || "—",
        aplicacao_id: selectedApp,
        owner_email: app.owner || null,
        token,
        tipo: "aplicacao",
      })
      .select("id")
      .single();

    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setCreating(false); return; }

    // Find all users with active access to this app via perfil_aplicacoes -> perfil_atribuicoes
    const { data: perfilApps } = await supabase
      .from("perfil_aplicacoes")
      .select("perfil_id, perfis_acesso(nome)")
      .eq("aplicacao_id", selectedApp);

    const perfilIds = (perfilApps || []).map((pa: any) => pa.perfil_id);

    if (perfilIds.length > 0) {
      const { data: atribuicoes } = await supabase
        .from("perfil_atribuicoes")
        .select("colaborador_id, perfil_id, colaboradores(nome), perfis_acesso(nome), terceiro_id, terceiros(nome)")
        .eq("ativo", true)
        .in("perfil_id", perfilIds);

      const itens = (atribuicoes || []).map((a: any) => ({
        revisao_id: revisao.id,
        colaborador_id: a.colaborador_id || null,
        colaborador_nome: a.colaboradores?.nome || a.terceiros?.nome || "—",
        perfil_id: a.perfil_id,
        perfil_nome: a.perfis_acesso?.nome || "—",
      }));

      if (itens.length > 0) {
        await supabase.from("revisao_itens").insert(itens);
        await supabase.from("revisoes").update({ total_itens: itens.length }).eq("id", revisao.id);
      }
    }

    // Call send-review-email edge function
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (projectId) {
      await supabase.functions.invoke("send-review-email", { body: { revisao_id: revisao.id } });
    }

    toast({ title: "Campanha criada", description: `Revisão para ${app.nome} criada com sucesso.` });
    qc.invalidateQueries({ queryKey: ["revisoes"] });
    setCreating(false);
    setDialogOpen(false);
    setSelectedApp("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revisões de Acesso</h1>
          <p className="text-sm text-muted-foreground">Campanhas periódicas de recertificação</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova Campanha</Button>
      </div>
      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Status</th>
            <th className="p-4 font-medium">Progresso</th><th className="p-4 font-medium">Responsável</th>
            <th className="p-4 font-medium">Data Limite</th>
          </tr></thead><tbody>
            {paginatedItems.map((r: any) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4"><Link to={`/revisoes/${r.id}`} className="font-medium text-primary hover:underline">{r.nome}</Link></td>
                <td className="p-4"><Badge variant="outline" className={statusColors[r.status] || ""}>{r.status.replace(/_/g, " ")}</Badge></td>
                <td className="p-4 min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <Progress value={r.total_itens > 0 ? (r.itens_revisados / r.total_itens) * 100 : 0} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground">{r.itens_revisados}/{r.total_itens}</span>
                  </div>
                </td>
                <td className="p-4 text-muted-foreground">{r.responsavel || "—"}</td>
                <td className="p-4 text-muted-foreground text-xs">{r.data_fim ? new Date(r.data_fim).toLocaleDateString("pt-BR") : "—"}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Campanha de Revisão</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Aplicação</Label>
              <Select value={selectedApp} onValueChange={setSelectedApp}>
                <SelectTrigger><SelectValue placeholder="Selecione a aplicação" /></SelectTrigger>
                <SelectContent>
                  {(aplicacoes || []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome} {a.owner ? `(Owner: ${a.owner})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedApp && (
              <p className="text-xs text-muted-foreground">
                O sistema irá listar todos os colaboradores e terceiros com acesso ativo a esta aplicação para revisão pelo owner.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleNovaCampanha} disabled={!selectedApp || creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
