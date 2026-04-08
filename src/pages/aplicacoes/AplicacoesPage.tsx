import { useState } from "react";
import { useCanEdit } from "@/hooks/useRole";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, CheckCircle, Pencil, Trash2, RefreshCw, Globe, Cloud, AlertTriangle, Users } from "lucide-react";
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
import { logAuditoria } from "@/lib/auditLogger";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AppIcon from "@/components/AppIcon";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AplicacoesPage() {
  const { data: apps, isLoading } = useAplicacoes();
  const navigate = useNavigate();

  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", criticidade: "media", tipo_auth: "", owner: "", url: "", aprovacao_necessaria: false, integracao_ativa: false });
  const [syncing, setSyncing] = useState(false);
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [filtroCriticidade, setFiltroCriticidade] = useState<string>("todas");
  const qc = useQueryClient();
  const { toast } = useToast();

  const allApps = apps ?? [];
  const list = allApps.filter((a: any) => {
    if (busca && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroOrigem === "azure" && (a as any).origem !== "azure") return false;
    if (filtroOrigem === "manual" && (a as any).origem === "azure") return false;
    if (filtroCriticidade !== "todas" && a.criticidade !== filtroCriticidade) return false;
    return true;
  });
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  // Counters
  const totalApps = allApps.length;
  const azureApps = allApps.filter((a: any) => (a as any).origem === "azure").length;
  const criticasApps = allApps.filter((a: any) => a.criticidade === "critica").length;
  const semOwner = allApps.filter((a: any) => !a.owner).length;

  const openNew = () => { setEditing(null); setForm({ nome: "", criticidade: "media", tipo_auth: "", owner: "", url: "", aprovacao_necessaria: false, integracao_ativa: false }); setDialogOpen(true); };
  const openEdit = (a: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(a);
    setForm({ nome: a.nome, criticidade: a.criticidade, tipo_auth: a.tipo_auth || "", owner: a.owner || "", url: (a as any).url || "", aprovacao_necessaria: a.aprovacao_necessaria, integracao_ativa: a.integracao_ativa });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), criticidade: form.criticidade as any, tipo_auth: form.tipo_auth || null, owner: form.owner || null, url: form.url || null, aprovacao_necessaria: form.aprovacao_necessaria, integracao_ativa: form.integracao_ativa } as any;
    if (editing) {
      const { error } = await supabase.from("aplicacoes").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "editar_aplicacao", entidade: "aplicacoes", entidade_id: editing.id, resumo: `Editada: ${form.nome}` });
      toast({ title: "Aplicação atualizada" });
    } else {
      payload.origem = "manual";
      const { data, error } = await supabase.from("aplicacoes").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_aplicacao", entidade: "aplicacoes", entidade_id: data?.id, resumo: `Criada: ${form.nome}` });
      toast({ title: "Aplicação criada" });
    }
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const deletingApp = allApps.find((a: any) => a.id === deleteId);
    const { error } = await supabase.from("aplicacoes").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_aplicacao", entidade: "aplicacoes", entidade_id: deleteId, resumo: `Excluída: ${(deletingApp as any)?.nome}` });
    toast({ title: "Aplicação excluída" });
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    setDeleteId(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-entra-apps");
      if (error) throw error;
      toast({
        title: "Sincronização concluída",
        description: `${data.total} apps encontrados — ${data.created} novos, ${data.updated} atualizados`,
      });
      qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    } catch (err: any) {
      toast({ title: "Erro na sincronização", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <p className="text-sm text-muted-foreground">Catálogo corporativo de aplicações</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sincronizar apps do Azure</TooltipContent>
          </Tooltip>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Aplicação</Button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Globe className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold">{totalApps}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center"><Cloud className="h-5 w-5 text-info" /></div>
          <div><p className="text-2xl font-bold">{azureApps}</p><p className="text-xs text-muted-foreground">Azure SSO</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
          <div><p className="text-2xl font-bold">{criticasApps}</p><p className="text-xs text-muted-foreground">Críticas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><Users className="h-5 w-5 text-warning" /></div>
          <div><p className="text-2xl font-bold">{semOwner}</p><p className="text-xs text-muted-foreground">Sem Owner</p></div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar aplicações..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={filtroOrigem} onValueChange={(v) => { setFiltroOrigem(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas origens</SelectItem>
            <SelectItem value="azure">Azure SSO</SelectItem>
            <SelectItem value="manual">Manual/Externa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroCriticidade} onValueChange={(v) => { setFiltroCriticidade(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Criticidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : paginatedItems.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma aplicação encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">Sincronize com o Azure ou crie uma aplicação manualmente</p>
            <div className="mt-4 flex gap-2 justify-center">
              <Button variant="outline" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Sincronizar Azure
              </Button>
              <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Aplicação</Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium hidden md:table-cell">Origem</th><th className="p-4 font-medium hidden lg:table-cell">Autenticação</th>
                <th className="p-4 font-medium hidden md:table-cell">Owner</th><th className="p-4 font-medium hidden lg:table-cell">Aprovação</th><th className="p-4 font-medium hidden lg:table-cell">Integração</th><th className="p-4 font-medium w-20">Ações</th>
              </tr></thead>
              <tbody>
                {paginatedItems.map((app: any) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/aplicacoes/${app.id}`)}>
                    <td className="p-4 font-medium text-primary hover:underline">
                      <div className="flex items-center gap-2">
                        <AppIcon url={app.url} origem={app.origem} size={20} />
                        {app.nome}
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      {(app as any).origem === "azure" ? (
                        <Badge variant="outline" className="bg-info/15 text-info border-info/30"><Cloud className="h-3 w-3 mr-1" />Azure</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground"><Globe className="h-3 w-3 mr-1" />Manual</Badge>
                      )}
                    </td>
                    <td className="p-4 hidden lg:table-cell"><Badge variant="outline">{app.tipo_auth || "—"}</Badge></td>
                    <td className="p-4 text-muted-foreground hidden md:table-cell">{app.owner || <span className="text-warning">Sem owner</span>}</td>
                    <td className="p-4 hidden lg:table-cell">
                      {app.aprovacao_necessaria ? (
                        <Tooltip><TooltipTrigger><CheckCircle className="h-4 w-4 text-success" /></TooltipTrigger>
                        <TooltipContent>Requer aprovação para concessão</TooltipContent></Tooltip>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4 hidden lg:table-cell">{app.integracao_ativa ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativa</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativa</Badge>}</td>
                    <td className="p-4"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => openEdit(app, e)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id); }}><Trash2 className="h-3 w-3" /></Button>
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
            <div className="space-y-2"><Label>URL de Acesso</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://app.exemplo.com" /></div>
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
