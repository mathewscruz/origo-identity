import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTerceiros } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function diasRestantes(dataFim: string | null): number { if (!dataFim) return 999; return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)); }

function fimContratoDisplay(dataFim: string | null) {
  if (!dataFim) return <span className="text-muted-foreground">—</span>;
  const dias = diasRestantes(dataFim);
  const formatted = new Date(dataFim).toLocaleDateString("pt-BR");
  if (dias < 0) return <span className="font-medium text-destructive">{formatted} (vencido)</span>;
  if (dias <= 7) return <span className="font-medium text-destructive">{formatted} ({dias}d)</span>;
  if (dias <= 30) return <span className="font-medium text-warning">{formatted} ({dias}d)</span>;
  return <span className="text-muted-foreground">{formatted}</span>;
}

export default function TerceirosPage() {
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data: terceiros, isLoading } = useTerceiros();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", email: "", empresa_terceira: "", contrato_inicio: "", contrato_fim: "", criticidade: "media", responsavel: "", ativo: true, sam_account_name: "" });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = terceiros ?? [];
  const vencendo7d = list.filter((t: any) => { const d = diasRestantes(t.contrato_fim); return d >= 0 && d <= 7; }).length;
  const filtered = list.filter((t: any) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const openNew = () => { setEditing(null); setForm({ nome: "", email: "", empresa_terceira: "", contrato_inicio: "", contrato_fim: "", criticidade: "media", responsavel: "", ativo: true, sam_account_name: "" }); setDialogOpen(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ nome: t.nome, email: t.email || "", empresa_terceira: t.empresa_terceira || "", contrato_inicio: t.contrato_inicio || "", contrato_fim: t.contrato_fim || "", criticidade: t.criticidade, responsavel: t.responsavel || "", ativo: t.ativo, sam_account_name: t.sam_account_name || "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), email: form.email || null, empresa_terceira: form.empresa_terceira || null, contrato_inicio: form.contrato_inicio || null, contrato_fim: form.contrato_fim || null, criticidade: form.criticidade as any, responsavel: form.responsavel || null, ativo: form.ativo };
    if (editing) {
      const { error } = await supabase.from("terceiros").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Terceiro atualizado" });
    } else {
      const { error } = await supabase.from("terceiros").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Terceiro criado" });
    }
    qc.invalidateQueries({ queryKey: ["terceiros"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("terceiros").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Terceiro excluído" });
    qc.invalidateQueries({ queryKey: ["terceiros"] });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Terceiros</h1><p className="text-sm text-muted-foreground">Ciclo de vida de terceiros com controle de contrato</p></div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Terceiro</Button>
      </div>

      {vencendo7d > 0 && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex items-center gap-3 py-3"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-sm font-medium text-destructive">{vencendo7d} terceiro(s) com contrato vencendo em 7 dias</span></CardContent></Card>}

      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar terceiros..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Empresa</th><th className="p-4 font-medium">Responsável</th>
            <th className="p-4 font-medium">Criticidade</th><th className="p-4 font-medium">Fim Contrato</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium w-20">Ações</th>
          </tr></thead><tbody>
            {paginatedItems.map((t: any) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4"><Link to={`/terceiros/${t.id}`} className="font-medium text-primary hover:underline">{t.nome}</Link></td>
                <td className="p-4 text-muted-foreground">{t.empresa_terceira || "—"}</td>
                <td className="p-4 text-muted-foreground">{t.responsavel || "—"}</td>
                <td className="p-4"><Badge variant="outline" className={criticidadeConfig[t.criticidade]?.class || ""}>{criticidadeConfig[t.criticidade]?.label || t.criticidade}</Badge></td>
                <td className="p-4">{fimContratoDisplay(t.contrato_fim)}</td>
                <td className="p-4"><Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Inativo"}</Badge></td>
                <td className="p-4"><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? "Editar Terceiro" : "Novo Terceiro"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome completo</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Empresa</Label><Input value={form.empresa_terceira} onChange={(e) => setForm({ ...form, empresa_terceira: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Início contrato</Label><Input type="date" value={form.contrato_inicio} onChange={(e) => setForm({ ...form, contrato_inicio: e.target.value })} /></div>
              <div className="space-y-2"><Label>Fim contrato</Label><Input type="date" value={form.contrato_fim} onChange={(e) => setForm({ ...form, contrato_fim: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Criticidade</Label>
                <Select value={form.criticidade} onValueChange={(v) => setForm({ ...form, criticidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Crítica</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Responsável</Label><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir terceiro?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
