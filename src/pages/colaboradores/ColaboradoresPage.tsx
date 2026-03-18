import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useColaboradores, useEmpresas, useAreas, useCargos, useLocalidades } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { provisionCargoAcessos } from "@/lib/provisionCargoAcessos";
import { createEventoJML } from "@/lib/createEventoJML";

async function disableEntraUser(colaboradorId: string, action: "disable" | "enable") {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/disable-entra-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ colaborador_id: colaboradorId, action }),
  });
  return res.json();
}

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "ferias", label: "Férias" },
  { value: "afastado", label: "Afastado" },
  { value: "desligado", label: "Desligado" },
];

interface ColabForm {
  nome: string;
  email: string;
  cpf: string;
  matricula: string;
  status: string;
  empresa_id: string;
  area_id: string;
  cargo_id: string;
  localidade_id: string;
  data_admissao: string;
}

const emptyForm: ColabForm = {
  nome: "", email: "", cpf: "", matricula: "", status: "ativo",
  empresa_id: "", area_id: "", cargo_id: "", localidade_id: "", data_admissao: "",
};

export default function ColaboradoresPage() {
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [areaFilter, setAreaFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCargoId, setEditingCargoId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingOrigem, setEditingOrigem] = useState<string | null>(null);
  const [form, setForm] = useState<ColabForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: colaboradores, isLoading } = useColaboradores();
  const { data: empresas } = useEmpresas();
  const { data: areas } = useAreas();
  const { data: cargos } = useCargos();
  const { data: localidades } = useLocalidades();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mapped = (colaboradores ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    email: c.email || "",
    cpf: c.cpf ? `***${c.cpf.slice(-6)}` : "—",
    cpf_raw: c.cpf || "",
    cargo: c.cargos?.nome || "—",
    cargo_id: c.cargo_id || "",
    area: c.areas?.nome || "—",
    area_id: c.area_id || "",
    empresa_id: c.empresa_id || "",
    localidade_id: c.localidade_id || "",
    matricula: c.matricula || "",
    data_admissao: c.data_admissao || "",
    status: c.status,
    origem: c.origem || "manual",
  }));

  const filtered = mapped.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.email.toLowerCase().includes(busca.toLowerCase())) return false;
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (areaFilter !== "todos" && c.area !== areaFilter) return false;
    if (cargoFilter !== "todos" && c.cargo !== cargoFilter) return false;
    return true;
  });

  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);
  const areasList = [...new Set(mapped.map((c) => c.area).filter((a) => a !== "—"))];
  const cargosList = [...new Set(mapped.map((c) => c.cargo).filter((c) => c !== "—"))];

  function openNew() {
    setEditingId(null);
    setEditingCargoId(null);
    setEditingStatus(null);
    setEditingAreaId(null);
    setEditingOrigem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: typeof mapped[0]) {
    setEditingId(c.id);
    setEditingCargoId(c.cargo_id || null);
    setEditingStatus(c.status);
    setEditingAreaId(c.area_id || null);
    setEditingOrigem(c.origem);
    setForm({
      nome: c.nome, email: c.email, cpf: c.cpf_raw, matricula: c.matricula,
      status: c.status, empresa_id: c.empresa_id, area_id: c.area_id,
      cargo_id: c.cargo_id, localidade_id: c.localidade_id, data_admissao: c.data_admissao,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(),
      email: form.email.trim() || null,
      cpf: form.cpf.trim() || null,
      matricula: form.matricula.trim() || null,
      status: form.status as any,
      empresa_id: form.empresa_id || null,
      area_id: form.area_id || null,
      cargo_id: form.cargo_id || null,
      localidade_id: form.localidade_id || null,
      data_admissao: form.data_admissao || null,
      origem: "manual",
    };

    let colaboradorId = editingId;
    let error;

    if (editingId) {
      ({ error } = await supabase.from("colaboradores").update(payload).eq("id", editingId));
    } else {
      const res = await supabase.from("colaboradores").insert(payload).select("id").single();
      error = res.error;
      colaboradorId = res.data?.id || null;
    }
    
    if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }

    // Provision access profiles if cargo changed
    const cargoChanged = form.cargo_id !== (editingCargoId || "");
    if (colaboradorId && (cargoChanged || !editingId)) {
      const result = await provisionCargoAcessos(colaboradorId, form.cargo_id || null, editingCargoId || null);
      if (result.provisioned > 0 || result.revoked > 0) {
        toast({ title: `Acessos atualizados: ${result.provisioned} concedido(s), ${result.revoked} revogado(s)` });
      }
    }

    setSaving(false);
    toast({ title: editingId ? "Colaborador atualizado" : "Colaborador criado" });
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("colaboradores").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Colaborador excluído" });
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    setDeleteId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Gestão de funcionários internos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Upload className="mr-1 h-4 w-4" />Importar Base</Button>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Colaborador</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar nome ou email..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas áreas</SelectItem>
            {areasList.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cargoFilter} onValueChange={(v) => { setCargoFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos cargos</SelectItem>
            {cargosList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Email</th>
                    <th className="p-4 font-medium">CPF</th>
                    <th className="p-4 font-medium">Cargo</th>
                    <th className="p-4 font-medium">Área</th>
                    <th className="p-4 font-medium">Origem</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4">
                        <Link to={`/colaboradores/${c.id}`} className="font-medium text-primary hover:underline">{c.nome}</Link>
                      </td>
                      <td className="p-4 text-muted-foreground">{c.email}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{c.cpf}</td>
                      <td className="p-4 text-muted-foreground">{c.cargo}</td>
                      <td className="p-4 text-muted-foreground">{c.area}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={
                          c.origem === "csv" ? "bg-primary/10 text-primary border-primary/30" :
                          c.origem === "entra_id" ? "bg-info/10 text-info border-info/30" :
                          "bg-muted text-muted-foreground"
                        }>{c.origem}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusConfig[c.status]?.class || ""}>
                          {statusConfig[c.status]?.label || c.status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      {/* Dialog Novo/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div>
              <Label>Matrícula</Label>
              <Input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa</Label>
              <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(empresas ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(areas ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cargo</Label>
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(cargos ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Localidade</Label>
              <Select value={form.localidade_id} onValueChange={(v) => setForm({ ...form, localidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(localidades ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Excluir */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os acessos e dados vinculados serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
