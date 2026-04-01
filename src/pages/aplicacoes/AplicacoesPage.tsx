import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

const MicrosoftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>
);

export default function AplicacoesPage() {
  const { data: apps, isLoading } = useAplicacoes();
  const { data: entraJob, refetch: refetchEntra } = useSyncJobs();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ nome: "", criticidade: "media", tipo_auth: "", owner: "", aprovacao_necessaria: false, integracao_ativa: false });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (apps ?? []).filter((a: any) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const openNew = () => { setEditing(null); setForm({ nome: "", criticidade: "media", tipo_auth: "", owner: "", aprovacao_necessaria: false, integracao_ativa: false }); setDialogOpen(true); };
  const openEdit = (a: any) => { setEditing(a); setForm({ nome: a.nome, criticidade: a.criticidade, tipo_auth: a.tipo_auth || "", owner: a.owner || "", aprovacao_necessaria: a.aprovacao_necessaria, integracao_ativa: a.integracao_ativa }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), criticidade: form.criticidade as any, tipo_auth: form.tipo_auth || null, owner: form.owner || null, aprovacao_necessaria: form.aprovacao_necessaria, integracao_ativa: form.integracao_ativa };
    if (editing) {
      const { error } = await supabase.from("aplicacoes").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Aplicação atualizada" });
    } else {
      const { error } = await supabase.from("aplicacoes").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Aplicação criada" });
    }
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("aplicacoes").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aplicação excluída" });
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    setDeleteId(null);
  };

  const handleMicrosoftImport = useCallback(async () => {
    setImporting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-entra-id`;
      const res = await fetch(url, {
        method: "POST",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (res.body) { const r = res.body.getReader(); while (!(await r.read()).done); }
      refetchEntra();
      qc.invalidateQueries({ queryKey: ["aplicacoes"] });
      toast({ title: "Importação concluída", description: "Apps do Microsoft Entra ID importados." });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    }
    setImporting(false);
  }, [toast, refetchEntra, qc]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <p className="text-sm text-muted-foreground">Catálogo corporativo de aplicações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleMicrosoftImport} disabled={importing}>
            <MicrosoftIcon />
            <span className="ml-1">{importing ? "Importando..." : "Importar Microsoft"}</span>
            {importing && <RefreshCw className="ml-1 h-3 w-3 animate-spin" />}
          </Button>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Aplicação</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar aplicações..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Criticidade</th><th className="p-4 font-medium">Autenticação</th>
                <th className="p-4 font-medium">Owner</th><th className="p-4 font-medium">Aprovação</th><th className="p-4 font-medium">Integração</th><th className="p-4 font-medium w-20">Ações</th>
              </tr></thead>
              <tbody>
                {paginatedItems.map((app: any) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4 font-medium text-primary">{app.nome}</td>
                    <td className="p-4"><Badge variant="outline" className={criticidadeColors[app.criticidade]}>{app.criticidade}</Badge></td>
                    <td className="p-4"><Badge variant="outline">{app.tipo_auth || "—"}</Badge></td>
                    <td className="p-4 text-muted-foreground">{app.owner || "—"}</td>
                    <td className="p-4">{app.aprovacao_necessaria ? <CheckCircle className="h-4 w-4 text-success" /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-4">{app.integracao_ativa ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativa</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativa</Badge>}</td>
                    <td className="p-4"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(app)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(app.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Aplicação" : "Nova Aplicação"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Criticidade</Label>
                <Select value={form.criticidade} onValueChange={(v) => setForm({ ...form, criticidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Crítica</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Tipo Auth</Label><Input value={form.tipo_auth} onChange={(e) => setForm({ ...form, tipo_auth: e.target.value })} placeholder="SSO, SAML..." /></div>
            </div>
            <div className="space-y-2"><Label>Owner</Label><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.aprovacao_necessaria} onCheckedChange={(v) => setForm({ ...form, aprovacao_necessaria: v })} /><Label>Aprovação necessária</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.integracao_ativa} onCheckedChange={(v) => setForm({ ...form, integracao_ativa: v })} /><Label>Integração ativa</Label></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir aplicação?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
