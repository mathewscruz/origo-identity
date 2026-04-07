import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Key } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditoria } from "@/lib/auditLogger";
import TablePagination, { usePagination } from "@/components/TablePagination";

function useProfiles() {
  return useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("nome");
      if (error) throw error;
      // fetch roles
      const { data: roles } = await (supabase as any).from("user_roles").select("*");
      const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
      return (data || []).map((p: any) => ({ ...p, role: roleMap.get(p.id) || "viewer" }));
    },
  });
}

export default function UsuariosPage() {
  const { data: profiles, isLoading } = useProfiles();
  const { role: myRole } = useAuth();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ email: "", nome: "", password: "", role: "viewer", ativo: true });
  const [changingPwd, setChangingPwd] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (profiles ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  const isAdmin = myRole === "admin";

  const openNew = () => { setEditing(null); setForm({ email: "", nome: "", password: "", role: "viewer", ativo: true }); setDialogOpen(true); };
  const openEdit = (u: any) => { setEditing(u); setForm({ email: u.email, nome: u.nome, password: "", role: u.role || "viewer", ativo: u.ativo }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.email.trim()) { toast({ title: "Nome e email obrigatórios", variant: "destructive" }); return; }
    if (editing) {
      // Update profile
      const { error } = await supabase.from("profiles").update({ nome: form.nome.trim(), email: form.email.trim(), ativo: form.ativo }).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      // Update role
      const { data: existingRole } = await (supabase as any).from("user_roles").select("id").eq("user_id", editing.id).maybeSingle();
      if (existingRole) {
        await (supabase as any).from("user_roles").update({ role: form.role }).eq("user_id", editing.id);
      } else {
        await (supabase as any).from("user_roles").insert({ user_id: editing.id, role: form.role });
      }
      await logAuditoria({ acao: "editar_usuario", entidade: "profiles", entidade_id: editing.id, resumo: `Editado: ${form.nome}, role: ${form.role}` });
      toast({ title: "Usuário atualizado" });
    } else {
      // Create via signup
      if (!form.password || form.password.length < 6) { toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" }); return; }
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { nome: form.nome.trim() } },
      });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      if (data.user) {
        await (supabase as any).from("user_roles").insert({ user_id: data.user.id, role: form.role });
      }
      await logAuditoria({ acao: "criar_usuario", entidade: "profiles", entidade_id: data.user?.id, resumo: `Criado: ${form.nome} (${form.email}), role: ${form.role}` });
      toast({ title: "Usuário criado", description: "Email de confirmação enviado." });
    }
    qc.invalidateQueries({ queryKey: ["admin_profiles"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Can't delete auth user from client, but we can deactivate profile
    const { error } = await supabase.from("profiles").update({ ativo: false }).eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "desativar_usuario", entidade: "profiles", entidade_id: deleteId });
    toast({ title: "Usuário desativado" });
    qc.invalidateQueries({ queryKey: ["admin_profiles"] });
    setDeleteId(null);
  };

  const roleLabel: Record<string, string> = { admin: "Admin", operador: "Operador", viewer: "Viewer" };

  if (!isAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Usuários do Sistema</h1><p className="text-sm text-muted-foreground">Gerenciar acesso, perfis e permissões</p></div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Usuário</Button>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Email</th><th className="p-4 font-medium">Perfil</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium w-28">Ações</th>
          </tr></thead><tbody>
            {paginatedItems.map((u: any) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="p-4 font-medium">{u.nome}</td>
                <td className="p-4 text-muted-foreground">{u.email}</td>
                <td className="p-4"><Badge variant="outline">{roleLabel[u.role] || u.role}</Badge></td>
                <td className="p-4"><Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></td>
                <td className="p-4"><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setChangingPwd(u.id); setNewPwd(""); }}><Key className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(u.id)}><Trash2 className="h-3 w-3" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={25} currentPage={safePage} onPageChange={setPage} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Usuário" : "Novo Usuário"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} /></div>
            {!editing && <div className="space-y-2"><Label>Senha</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>}
            <div className="space-y-2"><Label>Perfil</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="operador">Operador</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent>
              </Select>
            </div>
            {editing && <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changingPwd} onOpenChange={() => setChangingPwd(null)}>
        <DialogContent><DialogHeader><DialogTitle>Trocar Senha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nova senha</Label><Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setChangingPwd(null)}>Cancelar</Button><Button onClick={async () => {
            if (newPwd.length < 6) { toast({ title: "Mínimo 6 caracteres", variant: "destructive" }); return; }
            // Admin can only reset own password via updateUser
            const { error } = await supabase.auth.updateUser({ password: newPwd });
            if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
            toast({ title: "Senha atualizada" });
            setChangingPwd(null);
          }}>Atualizar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Desativar usuário?</AlertDialogTitle><AlertDialogDescription>O usuário será marcado como inativo e não poderá acessar o sistema.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Desativar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
