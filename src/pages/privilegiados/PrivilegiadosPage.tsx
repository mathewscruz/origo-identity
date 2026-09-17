import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Crown, RefreshCw, Search, Shield, ShieldAlert, Users, Link as LinkIcon, Plus, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import TablePagination from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";

const PAGE_SIZE = 15;

function relativeTime(iso?: string | null) {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function freshnessColor(iso?: string | null) {
  if (!iso) return "text-destructive";
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < 24) return "text-emerald-600";
  if (hours < 24 * 7) return "text-amber-600";
  return "text-destructive";
}

export default function PrivilegiadosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyPrivileged, setOnlyPrivileged] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [syncing, setSyncing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [adminOpen, setAdminOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ entra_id: "", display_name: "", email: "", motivo: "", dono_responsavel: "" });
  const navigate = useNavigate();

  const { data: roles, isLoading, refetch: refetchRoles } = useQuery({
    queryKey: ["entra-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_roles").select("*").order("is_privileged", { ascending: false }).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: allMembers, refetch: refetchMembers } = useQuery({
    queryKey: ["entra-role-members-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_role_members").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: roleMembers } = useQuery({
    queryKey: ["entra-role-members", selectedRole?.id],
    enabled: !!selectedRole,
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_role_members").select("*").eq("role_id", selectedRole.id).order("user_display_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: lastSync } = useQuery({
    queryKey: ["entra-roles-last-sync"],
    queryFn: async () => {
      const { data } = await supabase.from("parametros").select("valor").eq("chave", "entra_roles_last_sync").maybeSingle();
      return data?.valor || null;
    },
  });

  const { data: knownAdmins, refetch: refetchAdmins } = useQuery({
    queryKey: ["contas-admin-conhecidas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_admin_conhecidas").select("*").order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const knownSet = new Set((knownAdmins || []).map((a: any) => a.entra_id));

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await invokeFunction("sync-entra-roles");
      if (error) throw new Error(error);
      toast.success(`Sincronização concluída: ${data.roles} roles, ${data.members} atribuições${data.eligible ? `, ${data.eligible} elegíveis PIM` : ""}`);
      qc.invalidateQueries({ queryKey: ["entra-roles"] });
      qc.invalidateQueries({ queryKey: ["entra-role-members-all"] });
      qc.invalidateQueries({ queryKey: ["entra-roles-last-sync"] });
    } catch (err: any) {
      toast.error("Erro na sincronização: " + (err.message || "Erro desconhecido"));
    } finally {
      setSyncing(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdmin.entra_id || !newAdmin.motivo) {
      toast.error("Informe o ID do Entra e o motivo.");
      return;
    }
    const { error } = await supabase.from("contas_admin_conhecidas").insert(newAdmin);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta administrativa cadastrada.");
    setNewAdmin({ entra_id: "", display_name: "", email: "", motivo: "", dono_responsavel: "" });
    refetchAdmins();
  };

  const handleDeleteAdmin = async (id: string) => {
    const { error } = await supabase.from("contas_admin_conhecidas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido.");
    refetchAdmins();
  };

  const memberCountMap = new Map<string, number>();
  const typeCountMap = new Map<string, Map<string, number>>();
  (allMembers || []).forEach((m: any) => {
    memberCountMap.set(m.role_id, (memberCountMap.get(m.role_id) || 0) + 1);
    const inner = typeCountMap.get(m.role_id) || new Map<string, number>();
    inner.set(m.assignment_type || "permanente", (inner.get(m.assignment_type || "permanente") || 0) + 1);
    typeCountMap.set(m.role_id, inner);
  });

  const filtered = (roles || []).filter((r: any) => {
    if (onlyPrivileged && !r.is_privileged) return false;
    if (typeFilter !== "todos") {
      const t = typeCountMap.get(r.id);
      if (!t || !t.get(typeFilter)) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return r.nome?.toLowerCase().includes(s) || r.descricao?.toLowerCase().includes(s);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalRoles = roles?.length || 0;
  const privilegedRoles = roles?.filter((r: any) => r.is_privileged).length || 0;
  const totalAssignments = allMembers?.length || 0;
  const uniqueUsers = new Set((allMembers || []).map((m: any) => m.user_entra_id)).size;
  const eligibleCount = (allMembers || []).filter((m: any) => m.assignment_type === "elegivel").length;
  const activePimCount = (allMembers || []).filter((m: any) => m.assignment_type === "ativo_pim").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Acessos Privilegiados"
        icon={Crown}
        description={<>Funções administrativas do Microsoft Entra ID, atribuições permanentes e PIM.<span className={`ml-2 font-medium ${freshnessColor(lastSync)}`}>• Última sincronização: {relativeTime(lastSync)}</span></>}
        actions={<>
          <Button variant="outline" onClick={() => setAdminOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Contas administrativas
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar com Entra ID"}
          </Button>
        </>}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Roles</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalRoles}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Privilegiadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-500">{privilegedRoles}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Atribuições</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalAssignments}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Elegíveis PIM</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{eligibleCount}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Ativos PIM</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{activePimCount}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as atribuições</SelectItem>
            <SelectItem value="permanente">Permanentes</SelectItem>
            <SelectItem value="elegivel">Elegíveis PIM</SelectItem>
            <SelectItem value="ativo_pim">Ativos PIM</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="priv-filter" checked={onlyPrivileged} onCheckedChange={(v) => { setOnlyPrivileged(v); setPage(1); }} />
          <Label htmlFor="priv-filter" className="text-sm">Apenas privilegiadas</Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Função</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead>Privilegiado</TableHead>
                <TableHead>Atribuições</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : paginated.length === 0 ? (
                <TableRow><TableCell colSpan={5}>
                  <EmptyState message={totalRoles === 0 ? 'Nenhuma role sincronizada. Clique em "Sincronizar com Entra ID".' : "Nenhuma role encontrada com os filtros aplicados."} />
                </TableCell></TableRow>
              ) : paginated.map((role: any) => {
                const count = memberCountMap.get(role.id) || 0;
                const types = typeCountMap.get(role.id);
                return (
                  <TableRow key={role.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRole(role)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {role.is_privileged ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <Shield className="h-4 w-4 text-muted-foreground" />}
                        {role.nome}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-md truncate">{role.descricao || "—"}</TableCell>
                    <TableCell>
                      {role.is_privileged ? <Badge className="bg-amber-100 text-amber-800 border-amber-300">Sim</Badge> : <Badge variant="outline">Não</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={count > 3 && role.is_privileged ? "text-destructive font-semibold" : ""}>{count}</span>
                        {types && types.get("elegivel") ? <Badge variant="outline" className="border-blue-300 text-blue-700 text-xs">{types.get("elegivel")} elegível</Badge> : null}
                        {types && types.get("ativo_pim") ? <Badge variant="outline" className="border-amber-300 text-amber-700 text-xs">{types.get("ativo_pim")} PIM</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.is_built_in ? "secondary" : "outline"}>{role.is_built_in ? "Built-in" : "Custom"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > PAGE_SIZE && <TablePagination currentPage={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}

      {/* Role members dialog */}
      <Dialog open={!!selectedRole} onOpenChange={(o) => !o && setSelectedRole(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRole?.is_privileged ? <ShieldAlert className="h-5 w-5 text-amber-500" /> : <Shield className="h-5 w-5" />}
              {selectedRole?.nome}
            </DialogTitle>
            {selectedRole?.descricao && <p className="text-sm text-muted-foreground mt-1">{selectedRole.descricao}</p>}
          </DialogHeader>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Membros ({roleMembers?.length || 0})</h3>
            {!roleMembers || roleMembers.length === 0 ? (
              <EmptyState message="Nenhum membro atribuído a esta role." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Janela</TableHead>
                    <TableHead>Vínculo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleMembers.map((m: any) => {
                    const typeLabel = m.assignment_type === "elegivel" ? "Elegível PIM" : m.assignment_type === "ativo_pim" ? "Ativo PIM" : "Permanente";
                    const typeClass = m.assignment_type === "elegivel" ? "border-blue-300 text-blue-700" : m.assignment_type === "ativo_pim" ? "border-amber-300 text-amber-700" : "";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.user_display_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.user_email || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={typeClass}>{typeLabel}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.end_at ? `até ${new Date(m.end_at).toLocaleDateString("pt-BR")}` : m.start_at ? `desde ${new Date(m.start_at).toLocaleDateString("pt-BR")}` : "—"}
                        </TableCell>
                        <TableCell>
                          {m.colaborador_id ? (
                            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => { setSelectedRole(null); navigate(`/colaboradores/${m.colaborador_id}`); }}>
                              <LinkIcon className="h-3.5 w-3.5 mr-1" />Colaborador
                            </Button>
                          ) : knownSet.has(m.user_entra_id) ? (
                            <Badge variant="outline" className="border-slate-400 text-slate-700">Conta administrativa</Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300">Não vinculado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Known admin accounts dialog */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Contas administrativas conhecidas</DialogTitle>
            <p className="text-sm text-muted-foreground">Contas de serviço, breakglass e admins dedicados que não correspondem a um colaborador. Cadastrando aqui, elas deixam de gerar o alerta "Não vinculado".</p>
          </DialogHeader>

          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="ID do Entra (objectId)" value={newAdmin.entra_id} onChange={(e) => setNewAdmin({ ...newAdmin, entra_id: e.target.value })} />
              <Input placeholder="Nome de exibição" value={newAdmin.display_name} onChange={(e) => setNewAdmin({ ...newAdmin, display_name: e.target.value })} />
              <Input placeholder="E-mail / UPN" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
              <Input placeholder="Dono / responsável" value={newAdmin.dono_responsavel} onChange={(e) => setNewAdmin({ ...newAdmin, dono_responsavel: e.target.value })} />
            </div>
            <Textarea placeholder="Motivo (ex: breakglass, conta de serviço Intune, etc.)" value={newAdmin.motivo} onChange={(e) => setNewAdmin({ ...newAdmin, motivo: e.target.value })} />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddAdmin}><Plus className="h-4 w-4 mr-1" /> Cadastrar</Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(knownAdmins || []).length === 0 ? (
                <TableRow><TableCell colSpan={5}><EmptyState message="Nenhuma conta administrativa cadastrada." /></TableCell></TableRow>
              ) : (knownAdmins || []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.display_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.email || "—"}</TableCell>
                  <TableCell className="text-sm">{a.motivo}</TableCell>
                  <TableCell className="text-sm">{a.dono_responsavel || "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteAdmin(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
