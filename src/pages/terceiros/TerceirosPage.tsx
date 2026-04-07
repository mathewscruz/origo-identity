import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { createEventoJML } from "@/lib/createEventoJML";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function diasRestantes(dataFim: string | null): number { if (!dataFim) return 999; return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)); }

function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function generateTerceiroCredentials(nome: string, empresaTerceira: string): { sam: string; email: string } {
  if (!nome.trim() || !empresaTerceira.trim()) return { sam: "", email: "" };
  const prepositions = new Set(["de", "da", "do", "dos", "das", "e"]);
  const parts = normalize(nome).split(/\s+/).filter(p => !prepositions.has(p) && p.length > 0);
  if (parts.length === 0) return { sam: "", email: "" };
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : first;
  const companyFirst = normalize(empresaTerceira).split(/\s+/).filter(p => p.length > 0)[0] || "";
  const sam = `${first}.${last}_${companyFirst}`;
  const email = `${sam}@parceiroorigo.com.br`;
  return { sam, email };
}

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
  const { profile } = useAuth();

  // Auto-generate credentials when nome or empresa change
  useEffect(() => {
    const { sam, email } = generateTerceiroCredentials(form.nome, form.empresa_terceira);
    setForm(prev => ({ ...prev, sam_account_name: sam, email: email }));
  }, [form.nome, form.empresa_terceira]);

  const list = terceiros ?? [];
  const vencendo7d = list.filter((t: any) => { const d = diasRestantes(t.contrato_fim); return d >= 0 && d <= 7; }).length;
  const filtered = list.filter((t: any) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const openNew = () => { setEditing(null); setForm({ nome: "", email: "", empresa_terceira: "", contrato_inicio: "", contrato_fim: "", criticidade: "media", responsavel: "", ativo: true, sam_account_name: "" }); setDialogOpen(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ nome: t.nome, email: t.email || "", empresa_terceira: t.empresa_terceira || "", contrato_inicio: t.contrato_inicio || "", contrato_fim: t.contrato_fim || "", criticidade: t.criticidade, responsavel: t.responsavel || "", ativo: t.ativo, sam_account_name: t.sam_account_name || "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!editing && !form.sam_account_name.trim()) { toast({ title: "Nome de login AD é obrigatório", variant: "destructive" }); return; }
    const payload: any = { nome: form.nome.trim(), email: form.email || null, empresa_terceira: form.empresa_terceira || null, contrato_inicio: form.contrato_inicio || null, contrato_fim: form.contrato_fim || null, criticidade: form.criticidade as any, responsavel: form.responsavel || null, ativo: form.ativo, sam_account_name: form.sam_account_name.trim() || null };
    if (editing) {
      // Detect disable: was active, now inactive
      const wasActive = editing.ativo;
      const nowInactive = !form.ativo;
      const { error } = await supabase.from("terceiros").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }

      if (wasActive && nowInactive && form.sam_account_name.trim()) {
        const sam = form.sam_account_name.trim();
        const terceiroId = editing.id;

        // Get active perfil_atribuicoes and revoke
        const { data: activeAtribuicoes } = await supabase.from("perfil_atribuicoes").select("perfil_id").eq("terceiro_id", terceiroId).eq("ativo", true);
        const perfilIds = (activeAtribuicoes ?? []).map((a: any) => a.perfil_id).filter(Boolean);
        if (perfilIds.length > 0) {
          await supabase.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() }).eq("terceiro_id", terceiroId).eq("ativo", true);
          const identity = form.email || sam;
          if (identity) {
            await queueFullProfileActions([{ id: terceiroId, nome: form.nome.trim(), email: form.email || null, sam_account_name: sam }], perfilIds, "remove", { triggerImmediately: false });
          }
        }

        // Remove individual resources
        const { data: individualItems } = await (supabase as any).from("iam_queue")
          .select("action_type, payload_json, target_identity")
          .eq("colaborador_id", terceiroId)
          .eq("requested_by", "manual_individual").eq("status", "success")
          .in("action_type", ["assign_group", "assign_license", "assign_app"]);
        const individualSnapshot: any[] = [];
        const reverseMap: Record<string, string> = { assign_group: "remove_group", assign_license: "remove_license", assign_app: "remove_app" };
        for (const item of (individualItems ?? [])) {
          individualSnapshot.push({ action_type: item.action_type, payload_json: item.payload_json, target_identity: item.target_identity });
          await supabase.from("iam_queue" as any).insert({ action_type: reverseMap[item.action_type], payload_json: item.payload_json, requested_by: "sistema_desativacao", colaborador_id: terceiroId, target_identity: item.target_identity, status: "pending" });
        }

        // AD disable
        await supabase.from("iam_queue" as any).insert({ action_type: "disable", payload_json: { samAccountName: sam, mail: form.email || null, displayName: form.nome.trim(), status: "disabled" }, target_identity: sam, requested_by: "sistema", status: "pending", colaborador_id: terceiroId });
        // Entra disable
        const entraId = form.email || sam;
        await supabase.from("iam_queue" as any).insert({ action_type: "disable_entra", payload_json: { mail: form.email || null, samAccountName: sam, displayName: form.nome.trim() }, target_identity: entraId, requested_by: "sistema", status: "pending", colaborador_id: terceiroId });

        await createEventoJML({ colaboradorId: terceiroId, colaboradorNome: form.nome.trim(), tipo: "leaver", dadosAntes: { status: "ativo", perfis: perfilIds, recursos_individuais: individualSnapshot }, dadosDepois: { status: "inativo" } });
        await logAuditoria({ acao: "desativar_terceiro_inline", entidade: "terceiros", entidade_id: terceiroId, resumo: `Terceiro ${form.nome.trim()} desativado via edição`, operador: profile?.email });
        triggerEntraProcessing(true);
        toast({ title: "Terceiro desativado — remoções e desativação enviadas" });
      } else if (!wasActive && !nowInactive && form.sam_account_name.trim()) {
        // Reactivation via switch
        const sam = form.sam_account_name.trim();
        const terceiroId = editing.id;

        // Enable AD + Entra
        await supabase.from("iam_queue" as any).insert({ action_type: "update", payload_json: { samAccountName: sam, mail: form.email || null, displayName: form.nome.trim(), status: "enabled" }, target_identity: sam, requested_by: "sistema", status: "pending", colaborador_id: terceiroId });
        const entraId = form.email || sam;
        await supabase.from("iam_queue" as any).insert({ action_type: "enable_entra", payload_json: { mail: form.email || null, samAccountName: sam, displayName: form.nome.trim() }, target_identity: entraId, requested_by: "sistema", status: "pending", colaborador_id: terceiroId });

        // Restore from last leaver event
        const { data: lastLeaver } = await supabase.from("eventos_jml").select("dados_antes").eq("colaborador_id", terceiroId).eq("tipo", "leaver").order("created_at", { ascending: false }).limit(1);
        const dadosAntes = lastLeaver?.[0]?.dados_antes as any;
        const savedPerfis = dadosAntes?.perfis || [];
        const savedIndividuals = dadosAntes?.recursos_individuais || [];

        if (savedPerfis.length > 0) {
          for (const perfilId of savedPerfis) {
            await supabase.from("perfil_atribuicoes").insert({ perfil_id: perfilId, terceiro_id: terceiroId, origem: "manual", ativo: true });
          }
          await queueFullProfileActions([{ id: terceiroId, nome: form.nome.trim(), email: form.email || null, sam_account_name: sam }], savedPerfis, "assign", { triggerImmediately: false });
        }
        for (const item of savedIndividuals) {
          await supabase.from("iam_queue" as any).insert({ action_type: item.action_type, payload_json: item.payload_json, requested_by: "manual_individual", colaborador_id: terceiroId, target_identity: item.target_identity, status: "pending" });
        }

        await createEventoJML({ colaboradorId: terceiroId, colaboradorNome: form.nome.trim(), tipo: "joiner", dadosAntes: { status: "inativo" }, dadosDepois: { status: "ativo", perfis_restaurados: savedPerfis.length, recursos_individuais_restaurados: savedIndividuals.length } });
        await logAuditoria({ acao: "reativar_terceiro_inline", entidade: "terceiros", entidade_id: terceiroId, resumo: `Terceiro ${form.nome.trim()} reativado via edição`, operador: profile?.email });
        triggerEntraProcessing(true);
        toast({ title: "Terceiro reativado — perfis e recursos restaurados" });
      } else {
        toast({ title: "Terceiro atualizado" });
      }
    } else {
      const { data: inserted, error } = await supabase.from("terceiros").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      // Generate iam_queue for AD creation
      if (form.sam_account_name.trim()) {
        const sam = form.sam_account_name.trim();
        const nameParts = form.nome.trim().split(" ");
        await supabase.from("iam_queue" as any).insert({
          action_type: "create",
          payload_json: {
            givenName: nameParts[0] || "",
            surname: nameParts.slice(1).join(" ") || nameParts[0],
            displayName: form.nome.trim(),
            samAccountName: sam,
            userPrincipalName: `${sam}@ebessolar.local`,
            mail: form.email || null,
            department: null,
            title: "Terceiro",
            company: form.empresa_terceira || null,
            telephoneNumber: null,
            manager: null,
            ouPath: "",
          },
          target_identity: sam,
          requested_by: "sistema",
          status: "pending",
        });
      }
      toast({ title: "Terceiro criado — solicitação enviada para processamento" });
    }
    qc.invalidateQueries({ queryKey: ["terceiros"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Find the terceiro to get sam_account_name
    const deleting = list.find((t: any) => t.id === deleteId);
    if (deleting && (deleting as any).sam_account_name) {
      const sam = (deleting as any).sam_account_name;
      await supabase.from("iam_queue" as any).insert({
        action_type: "disable",
        payload_json: {
          samAccountName: sam,
          mail: deleting.email || null,
          displayName: deleting.nome,
          status: "disabled",
          motivo: "Exclusão de terceiro do sistema",
        },
        target_identity: sam,
        requested_by: "sistema",
        status: "pending",
      });
    }
    const { error } = await supabase.from("terceiros").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Terceiro excluído — solicitação de desativação enviada" });
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
            <div className="space-y-2"><Label>Nome completo *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Nome de login AD (samAccountName) *</Label><Input placeholder="ex: joao.silva" value={form.sam_account_name} onChange={(e) => setForm({ ...form, sam_account_name: e.target.value })} /></div>
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
