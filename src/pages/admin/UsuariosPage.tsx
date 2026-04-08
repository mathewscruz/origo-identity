import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Key, Camera, Loader2 } from "lucide-react";
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
  const { role: myRole, user, profile: myProfile, refreshProfile } = useAuth();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ email: "", nome: "", role: "viewer", ativo: true, password: "" });
  const [changingPwd, setChangingPwd] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (profiles ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  const isAdmin = myRole === "admin";

  const initials = myProfile?.nome ? myProfile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Selecione uma imagem", variant: "destructive" }); return; }
    if (file.size > 2 * 1024 * 1024) { toast({ title: "Imagem muito grande (máx. 2MB)", variant: "destructive" }); return; }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/avatar.${ext}`;

      // Remove old avatar files
      const { data: existing } = await supabase.storage.from("avatars").list(user.id);
      if (existing?.length) {
        await supabase.storage.from("avatars").remove(existing.map(f => `${user.id}/${f.name}`));
      }

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: "Foto atualizada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const { data: existing } = await supabase.storage.from("avatars").list(user.id);
      if (existing?.length) {
        await supabase.storage.from("avatars").remove(existing.map(f => `${user.id}/${f.name}`));
      }
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      await refreshProfile();
      toast({ title: "Foto removida" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setUploadingAvatar(false);
  };

  const openNew = () => { setEditing(null); setForm({ email: "", nome: "", role: "viewer", ativo: true, password: "" }); setDialogOpen(true); };
  const openEdit = (u: any) => { setEditing(u); setForm({ email: u.email, nome: u.nome, role: u.role || "viewer", ativo: u.ativo, password: "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.email.trim()) { toast({ title: "Nome e email obrigatórios", variant: "destructive" }); return; }
    if (!editing && form.password.length < 6) { toast({ title: "Senha obrigatória (mínimo 6 caracteres)", variant: "destructive" }); return; }
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
      // Create via edge function — sends invite email
      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: form.email.trim(), nome: form.nome.trim(), role: form.role, password: form.password }),
      });
      const result = await res.json();
      if (!res.ok) { toast({ title: "Erro", description: result.error || "Falha ao convidar usuário", variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_usuario", entidade: "profiles", entidade_id: result.user_id, resumo: `Criado: ${form.nome} (${form.email}), role: ${form.role}` });
      toast({ title: "Usuário criado com sucesso", description: `${form.email} já pode acessar o sistema.` });
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

      {/* Minha Foto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Minha Foto de Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground overflow-hidden border-2 border-border">
                {myProfile?.avatar_url ? (
                  <img src={myProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl">{initials}</span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingAvatar ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Clique na foto ou use os botões para alterar.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                  {uploadingAvatar ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />}
                  Alterar foto
                </Button>
                {myProfile?.avatar_url && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemoveAvatar} disabled={uploadingAvatar}>
                    <Trash2 className="mr-1 h-3 w-3" />Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
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
            const session = (await supabase.auth.getSession()).data.session;
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
              body: JSON.stringify({ action: "reset_password", user_id: changingPwd, password: newPwd }),
            });
            const result = await res.json();
            if (!res.ok) { toast({ title: "Erro", description: result.error || "Falha ao redefinir senha", variant: "destructive" }); return; }
            toast({ title: "Senha atualizada com sucesso" });
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
