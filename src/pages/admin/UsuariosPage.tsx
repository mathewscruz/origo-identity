import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, KeyRound, Camera, Loader2, MoreHorizontal, Search, ShieldCheck, ShieldOff, UserCheck, Users, UsersRound, Crown, Eye, Wrench, Lock, Mail, Clock, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { useAvatarUrl } from "@/lib/avatarUrl";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { tempoRelativo } from "@/lib/alertLabels";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Usuario = any;

const ROLES: { value: string; label: string; short: string; desc: string; icon: typeof Crown; badge: string; platformOnly?: boolean }[] = [
  { value: "platform_admin", label: "Platform admin", short: "Platform", desc: "Tudo do administrador + SQL/DDL e purgas via Hermes (MCP).", icon: Crown, badge: "bg-violet-500/15 text-violet-700 border-violet-500/30", platformOnly: true },
  { value: "admin", label: "Administrador", short: "Admin", desc: "Gerencia usuários, aprova a fila, configura parâmetros e integrações.", icon: ShieldCheck, badge: "bg-primary/15 text-primary border-primary/30" },
  { value: "operador", label: "Operador", short: "Operador", desc: "Opera o dia a dia: pessoas, acessos, fila, revisões e exceções.", icon: Wrench, badge: "bg-info/15 text-info border-info/30" },
  { value: "viewer", label: "Somente leitura", short: "Leitura", desc: "Consulta tudo, não altera nada.", icon: Eye, badge: "bg-muted text-muted-foreground" },
];
const roleMeta = (r: string) => ROLES.find((x) => x.value === r) ?? ROLES[3];

function useUsuarios() {
  return useQuery({
    queryKey: ["admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_usuarios_resumo");
      if (error) throw error;
      return (data ?? []) as unknown as Usuario[];
    },
  });
}

function Avatar({ nome, src, size = "h-9 w-9 text-xs" }: { nome?: string; src?: string | null; size?: string }) {
  const initials = nome ? nome.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "??";
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground", size)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </div>
  );
}

export default function UsuariosPage() {
  const { data: usuarios, isLoading } = useUsuarios();
  const { role: myRole, user, profile: myProfile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const iAmPlatform = myRole === "platform_admin";
  const isAdmin = myRole === "admin" || iAmPlatform;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busca, setBusca] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ email: "", nome: "", role: "operador", password: "" });
  const [saving, setSaving] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<Usuario | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [statusTarget, setStatusTarget] = useState<Usuario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarSrc = useAvatarUrl(myProfile?.avatar_url);

  const list = usuarios ?? [];
  const ativos = list.filter((u) => u.ativo).length;
  const admins = list.filter((u) => ["admin", "platform_admin"].includes(u.role) && u.ativo).length;
  const senhaTemp = list.filter((u) => u.must_change_password && u.ativo).length;
  const semAcesso30d = list.filter((u) => u.ativo && (!u.last_sign_in_at || new Date(u.last_sign_in_at).getTime() < Date.now() - 30 * 86400000)).length;

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return list.filter((u) =>
      (roleFilter === "todos" || u.role === roleFilter) &&
      (statusFilter === "todos" || (statusFilter === "ativos" ? u.ativo : statusFilter === "inativos" ? !u.ativo : statusFilter === "senha_temp" ? !!u.must_change_password : true)) &&
      (!q || `${u.nome} ${u.email}`.toLowerCase().includes(q)));
  }, [list, busca, roleFilter, statusFilter]);
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin_profiles"] });
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await invokeFunction<Usuario>("admin-users", body);
    if (error) throw new Error(error);
    return data;
  };

  // ── minha foto ──
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { toast({ title: "Selecione uma imagem", variant: "destructive" }); return; }
    if (file.size > 2 * 1024 * 1024) { toast({ title: "Imagem muito grande (máx. 2 MB)", variant: "destructive" }); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/avatar.${ext}`;
      const { data: existing } = await supabase.storage.from("avatars").list(user.id);
      if (existing?.length) await supabase.storage.from("avatars").remove(existing.map((f) => `${user.id}/${f.name}`));
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: filePath }).eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast({ title: "Foto atualizada", variant: "success" });
    } catch (err) {
      toast({ title: "Erro ao enviar foto", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const { data: existing } = await supabase.storage.from("avatars").list(user.id);
      if (existing?.length) await supabase.storage.from("avatars").remove(existing.map((f) => `${user.id}/${f.name}`));
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      await refreshProfile();
      toast({ title: "Foto removida" });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setUploadingAvatar(false);
  };

  // ── criar / editar ──
  const openNew = () => { setEditing(null); setForm({ email: "", nome: "", role: "operador", password: "" }); setDialogOpen(true); };
  const openEdit = (u: Usuario) => { setEditing(u); setForm({ email: u.email, nome: u.nome, role: u.role || "viewer", password: "" }); setDialogOpen(true); };
  const handleSave = async () => {
    if (!form.nome.trim() || !form.email.trim()) { toast({ title: "Nome e e-mail são obrigatórios", variant: "destructive" }); return; }
    if (!editing && form.password.length < 8) { toast({ title: "Senha temporária com no mínimo 8 caracteres", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editing) {
        await call({ action: "update", user_id: editing.id, nome: form.nome.trim(), role: form.role });
        toast({ title: "Usuário atualizado", description: `${form.nome} · ${roleMeta(form.role).label}`, variant: "success" });
        if (editing.id === user?.id) await refreshProfile();
      } else {
        const r = await call({ action: "create", email: form.email.trim(), nome: form.nome.trim(), role: form.role, password: form.password });
        if (r?.email_enviado) toast({ title: "Usuário criado", description: `Boas-vindas com a senha temporária enviadas para ${form.email}.`, variant: "success" });
        else toast({ title: "Usuário criado — e-mail não enviado", description: r?.email_erro || "Compartilhe a senha temporária por outro canal.", variant: "warning" });
      }
      refresh(); setDialogOpen(false);
    } catch (err) {
      toast({ title: editing ? "Não foi possível atualizar" : "Não foi possível criar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleResetPwd = async () => {
    if (!pwdTarget) return;
    if (newPwd.length < 8) { toast({ title: "Mínimo 8 caracteres", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const r = await call({ action: "reset_password", user_id: pwdTarget.id, password: newPwd });
      toast({ title: "Senha redefinida", description: r?.email_enviado ? `Nova senha enviada para ${pwdTarget.email}; troca obrigatória no próximo login.` : `E-mail não enviado (${r?.email_erro || "sem SendGrid"}) — informe a senha por outro canal.`, variant: r?.email_enviado ? "success" : "warning" });
      setPwdTarget(null); setNewPwd(""); refresh();
    } catch (err) {
      toast({ title: "Não foi possível redefinir", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleSetActive = async () => {
    if (!statusTarget) return;
    setBusy(true);
    const ativo = !statusTarget.ativo;
    try {
      await call({ action: "set_active", user_id: statusTarget.id, ativo, motivo: motivo.trim() || null });
      toast({ title: ativo ? "Usuário reativado" : "Usuário desativado", description: ativo ? `${statusTarget.nome} volta a acessar o painel.` : `${statusTarget.nome} perdeu o acesso ao painel (sessões bloqueadas).`, variant: ativo ? "success" : "warning" });
      setStatusTarget(null); setMotivo(""); refresh();
    } catch (err) {
      toast({ title: "Não foi possível alterar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await call({ action: "delete", user_id: deleteTarget.id, motivo: motivo.trim() || null });
      toast({ title: "Usuário excluído", description: `${deleteTarget.email} foi removido do painel. A trilha de auditoria é mantida.` });
      setDeleteTarget(null); setMotivo(""); setConfirmEmail(""); refresh();
    } catch (err) {
      toast({ title: "Não foi possível excluir", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!isAdmin) {
    return <div className="py-16"><EmptyState icon={Lock} title="Acesso restrito" message="Só administradores gerenciam os usuários do painel." size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuários do painel"
        icon={UsersRound}
        description="Quem administra a plataforma: papéis, acesso, senha temporária e bloqueio. Colaboradores e terceiros são gerenciados em Identidades."
        actions={<Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Novo usuário</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Usuários" value={list.length} icon={Users} tone="primary" active={statusFilter === "todos" && roleFilter === "todos"} onClick={() => { setStatusFilter("todos"); setRoleFilter("todos"); setPage(1); }} />
        <StatCard label="Ativos" value={ativos} icon={UserCheck} tone="success" active={statusFilter === "ativos"} onClick={() => { setStatusFilter(statusFilter === "ativos" ? "todos" : "ativos"); setPage(1); }} hint={`${list.length - ativos} inativo(s)`} />
        <StatCard label="Administradores" value={admins} icon={ShieldCheck} tone={admins <= 1 ? "warning" : "info"} hint={admins <= 1 ? "só um admin ativo — cadastre outro" : "ativos"} active={roleFilter === "admin"} onClick={() => { setRoleFilter(roleFilter === "admin" ? "todos" : "admin"); setPage(1); }} />
        <StatCard label="Senha temporária" value={senhaTemp} icon={KeyRound} tone={senhaTemp ? "warning" : "default"} hint="ainda não trocaram" active={statusFilter === "senha_temp"} onClick={() => { setStatusFilter(statusFilter === "senha_temp" ? "todos" : "senha_temp"); setPage(1); }} />
        <StatCard label="Sem acesso há 30 d" value={semAcesso30d} icon={Clock} tone={semAcesso30d ? "warning" : "default"} hint="ativos que não entram" />
      </div>

      {/* minha conta */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="group relative">
            <Avatar nome={myProfile?.nome} src={avatarSrc} size="h-16 w-16 text-lg" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar} className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Alterar foto">
              {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{myProfile?.nome || "Você"}<Badge variant="outline" className={roleMeta(myRole || "viewer").badge}>{roleMeta(myRole || "viewer").label}</Badge></p>
            <p className="text-xs text-muted-foreground">{myProfile?.email}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{roleMeta(myRole || "viewer").desc}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>{uploadingAvatar ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />}Alterar foto</Button>
            {myProfile?.avatar_url && <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemoveAvatar} disabled={uploadingAvatar}><Trash2 className="mr-1 h-3 w-3" />Remover</Button>}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Nome ou e-mail…" className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} /></div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}><SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os papéis</SelectItem>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}><SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os status</SelectItem><SelectItem value="ativos">Ativos</SelectItem><SelectItem value="inativos">Inativos</SelectItem><SelectItem value="senha_temp">Senha temporária</SelectItem></SelectContent></Select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} usuário(s)</span>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : paginatedItems.length === 0 ? (
          <EmptyState icon={UsersRound} title="Nenhum usuário" message={list.length ? "Nenhum usuário com esses filtros." : "Cadastre o primeiro usuário do painel."} size="lg" action={!list.length && <Button size="sm" onClick={openNew}><Plus className="mr-1 h-3.5 w-3.5" />Novo usuário</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3 font-medium">Usuário</th><th className="p-3 font-medium">Papel</th><th className="p-3 font-medium">Status</th>
                <th className="hidden p-3 font-medium lg:table-cell">Último acesso</th><th className="hidden p-3 font-medium xl:table-cell">Ações (30 d)</th><th className="hidden p-3 font-medium xl:table-cell">Criado em</th><th className="w-12 p-3" />
              </tr></thead>
              <tbody>
                {paginatedItems.map((u: Usuario) => {
                  const rm = roleMeta(u.role);
                  const isMe = u.id === user?.id;
                  const locked = rm.platformOnly && !iAmPlatform;
                  return (
                    <tr key={u.id} className={cn("border-b last:border-0 transition-colors hover:bg-muted/40", !u.ativo && "opacity-70")}>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar nome={u.nome} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium">{u.nome || "—"}{isMe && <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">você</Badge>}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Badge variant="outline" className={cn("gap-1", rm.badge)}><rm.icon className="h-3 w-3" />{rm.label}</Badge></span></TooltipTrigger><TooltipContent className="max-w-xs">{rm.desc}</TooltipContent></Tooltip>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className={u.ativo ? "border-success/30 bg-success/15 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                          {u.bloqueado && !u.ativo && <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-3 w-3" />bloqueado no Auth</Badge>}
                          {u.must_change_password && u.ativo && <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-[10px] text-warning"><KeyRound className="h-3 w-3" />senha temporária</Badge></span></TooltipTrigger><TooltipContent>Ainda não trocou a senha temporária.</TooltipContent></Tooltip>}
                        </div>
                      </td>
                      <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell" title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : ""}>{u.last_sign_in_at ? tempoRelativo(u.last_sign_in_at) : <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" />nunca entrou</span>}</td>
                      <td className="hidden p-3 text-xs tabular-nums text-muted-foreground xl:table-cell">{u.auditoria_30d ?? 0}</td>
                      <td className="hidden p-3 text-xs text-muted-foreground xl:table-cell">{u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{u.email}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={locked} onClick={() => openEdit(u)}><Pencil className="mr-2 h-4 w-4" />Editar nome e papel</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setPwdTarget(u); setNewPwd(""); }}><KeyRound className="mr-2 h-4 w-4" />Redefinir senha</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={isMe || locked} onClick={() => { setStatusTarget(u); setMotivo(""); }}>
                              {u.ativo ? <><ShieldOff className="mr-2 h-4 w-4 text-warning" />Desativar acesso</> : <><ShieldCheck className="mr-2 h-4 w-4 text-success" />Reativar acesso</>}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={isMe || locked} className="text-destructive focus:text-destructive" onClick={() => { setDeleteTarget(u); setMotivo(""); setConfirmEmail(""); }}><Trash2 className="mr-2 h-4 w-4" />Excluir usuário</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      {/* criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário do painel"}</DialogTitle>
            <DialogDescription>{editing ? "Nome e papel. O e-mail é o login e não muda." : "O usuário recebe por e-mail a senha temporária e troca no primeiro login."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus /></div>
              <div className="space-y-1.5"><Label>E-mail (login)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} placeholder="nome@origoenergia.com.br" /></div>
            </div>
            {!editing && <div className="space-y-1.5"><Label>Senha temporária</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" /><p className="text-xs text-muted-foreground">Enviada por e-mail; troca obrigatória no primeiro acesso.</p></div>}
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ROLES.map((r) => {
                  const disabled = r.platformOnly && !iAmPlatform;
                  return (
                    <button key={r.value} type="button" disabled={disabled} onClick={() => setForm({ ...form, role: r.value })} className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors", form.role === r.value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50", disabled && "cursor-not-allowed opacity-50")}>
                      <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span><span className="block text-sm font-medium">{r.label}</span><span className="block text-[11px] leading-snug text-muted-foreground">{r.desc}{disabled ? " (só platform_admin concede)" : ""}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Criar e enviar e-mail"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* redefinir senha */}
      <Dialog open={!!pwdTarget} onOpenChange={(o) => !o && setPwdTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Redefinir senha</DialogTitle><DialogDescription>{pwdTarget?.nome} ({pwdTarget?.email}) recebe a nova senha por e-mail e precisa trocá-la no próximo login.</DialogDescription></DialogHeader>
          <div className="space-y-1.5 py-1"><Label>Nova senha temporária</Label><Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 8 caracteres" autoFocus /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPwdTarget(null)}>Cancelar</Button><Button onClick={handleResetPwd} disabled={busy || newPwd.length < 8}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Redefinir e enviar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* desativar / reativar */}
      <AlertDialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusTarget?.ativo ? "Desativar acesso ao painel?" : "Reativar acesso ao painel?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.ativo
                ? <><strong>{statusTarget?.nome}</strong> perde o acesso imediatamente: a conta é bloqueada no Auth e as sessões abertas caem. O histórico de auditoria é preservado e a conta pode ser reativada depois.</>
                : <><strong>{statusTarget?.nome}</strong> volta a acessar o painel com o papel <strong>{roleMeta(statusTarget?.role || "viewer").label}</strong>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5"><Label>Motivo (opcional, fica na auditoria)</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={statusTarget?.ativo ? "Ex.: saiu da equipe de TI" : "Ex.: retornou à equipe"} /></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleSetActive(); }} disabled={busy} className={statusTarget?.ativo ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{statusTarget?.ativo ? "Desativar" : "Reativar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* excluir */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Excluir usuário definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta de <strong>{deleteTarget?.nome}</strong> ({deleteTarget?.email}) é removida do Auth e do painel. Não dá para desfazer; a trilha de auditoria com as ações dessa pessoa continua existindo. Prefira <strong>desativar</strong> se houver chance de retorno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Digite o e-mail para confirmar</Label><Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={deleteTarget?.email} /></div>
            <div className="space-y-1.5"><Label>Motivo (opcional)</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={busy || confirmEmail.trim().toLowerCase() !== String(deleteTarget?.email || "").toLowerCase()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
