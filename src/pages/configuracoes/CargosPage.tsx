import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCargos, useAreas, usePerfisAcesso } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { reprovisionCargoCollaborators } from "@/lib/entraQueueHelper";

export default function CargosPage() {
  const { data: cargos, isLoading } = useCargos();
  const { data: areas } = useAreas();
  const { data: perfisAcesso } = usePerfisAcesso();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", area_id: "", ativo: true });
  const [selectedPerfis, setSelectedPerfis] = useState<string[]>([]);
  const [cargoPerfisCurrent, setCargoPerfisCurrent] = useState<string[]>([]);
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (cargos ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  // Load cargo_perfis counts for display
  const [cargoPerfisMap, setCargoPerfisMap] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("cargo_perfis").select("cargo_id, perfil_id");
      if (data) {
        const map: Record<string, number> = {};
        data.forEach((r: any) => { map[r.cargo_id] = (map[r.cargo_id] || 0) + 1; });
        setCargoPerfisMap(map);
      }
    })();
  }, [cargos]);

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", area_id: "", ativo: true });
    setSelectedPerfis([]);
    setCargoPerfisCurrent([]);
    setDialogOpen(true);
  };

  const openEdit = async (c: any) => {
    setEditing(c);
    setForm({ nome: c.nome, area_id: c.area_id || "", ativo: c.ativo });
    // Load existing cargo_perfis for this cargo
    const { data } = await (supabase as any).from("cargo_perfis").select("perfil_id").eq("cargo_id", c.id);
    const ids = (data || []).map((r: any) => r.perfil_id);
    setSelectedPerfis(ids);
    setCargoPerfisCurrent(ids);
    setDialogOpen(true);
  };

  const togglePerfil = (perfilId: string) => {
    setSelectedPerfis((prev) =>
      prev.includes(perfilId) ? prev.filter((id) => id !== perfilId) : [...prev, perfilId]
    );
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), area_id: form.area_id || null, ativo: form.ativo };
    let cargoId = editing?.id;

    if (editing) {
      const { error } = await supabase.from("cargos").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data, error } = await supabase.from("cargos").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      cargoId = data.id;
    }

    // Sync cargo_perfis: delete removed, insert new
    const toRemove = cargoPerfisCurrent.filter((id) => !selectedPerfis.includes(id));
    const toAdd = selectedPerfis.filter((id) => !cargoPerfisCurrent.includes(id));

    if (toRemove.length > 0) {
      await (supabase as any).from("cargo_perfis").delete().eq("cargo_id", cargoId).in("perfil_id", toRemove);
    }
    if (toAdd.length > 0) {
      await (supabase as any).from("cargo_perfis").insert(toAdd.map((perfil_id) => ({ cargo_id: cargoId, perfil_id })));
    }

    toast({ title: editing ? "Cargo atualizado" : "Cargo criado" });

    // Queue update requests for affected collaborators
    if (editing && (toRemove.length > 0 || toAdd.length > 0)) {
      try {
        const { data: affectedColabs } = await supabase
          .from("colaboradores")
          .select("id, nome, matricula, email")
          .eq("cargo_id", cargoId);

        if (affectedColabs && affectedColabs.length > 0) {
          const queueItems = affectedColabs.map((c: any) => ({
            action_type: "update",
            payload_json: {
              samAccountName: c.matricula || c.email || "",
              displayName: c.nome,
              changedFields: { cargo_atualizado: form.nome },
            },
            requested_by: "sistema",
            colaborador_id: c.id,
          }));
          await (supabase as any).from("iam_queue").insert(queueItems);
          toast({ title: `${queueItems.length} solicitação(ões) de atualização enviada(s)` });
        }
      } catch (err) {
        console.error("Queue insert error:", err);
      }
    }

    qc.invalidateQueries({ queryKey: ["cargos"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("cargos").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cargo excluído" });
    qc.invalidateQueries({ queryKey: ["cargos"] });
    setDeleteId(null);
  };

  const activePerfis = ((perfisAcesso ?? []) as any[]).filter((p) => p.ativo);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Cargos</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Cargo</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Área</th>
                  <th className="pb-2 font-medium">Perfis</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium w-20">Ações</th>
                </tr></thead>
                <tbody>
                  {paginatedItems.map((cargo: any) => (
                    <tr key={cargo.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium">{cargo.nome}</td>
                      <td className="py-3 text-muted-foreground">{cargo.areas?.nome || "—"}</td>
                      <td className="py-3">
                        <Badge variant="outline">{cargoPerfisMap[cargo.id] || 0} perfis</Badge>
                      </td>
                      <td className="py-3"><Badge variant={cargo.ativo ? "default" : "secondary"}>{cargo.ativo ? "Ativo" : "Inativo"}</Badge></td>
                      <td className="py-3"><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cargo)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(cargo.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination totalItems={list.length} pageSize={25} currentPage={safePage} onPageChange={setPage} />
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar Cargo" : "Novo Cargo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Área</Label>
              <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar área (opcional)" /></SelectTrigger>
                <SelectContent>{(areas as any[] ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Perfis de Acesso</Label>
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                {activePerfis.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">Nenhum perfil de acesso disponível.</p>
                ) : activePerfis.map((p: any) => {
                  const apps = (p.perfil_aplicacoes || []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
                  return (
                    <label key={p.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedPerfis.includes(p.id)}
                        onCheckedChange={() => togglePerfil(p.id)}
                      />
                      <span className="text-sm flex-1">{p.nome}</span>
                      {apps.length > 0 && (
                        <span className="text-xs text-muted-foreground">{apps.join(", ")}</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {selectedPerfis.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedPerfis.length} perfil(is) selecionado(s)</p>
              )}
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir cargo?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
