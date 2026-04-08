import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Crown, RefreshCw, Search, Shield, ShieldAlert, Users, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import TablePagination from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 15;

export default function PrivilegiadosPage() {
  const [search, setSearch] = useState("");
  const [onlyPrivileged, setOnlyPrivileged] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data: roles, isLoading, refetch } = useQuery({
    queryKey: ["entra-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_roles" as any).select("*").order("is_privileged", { ascending: false }).order("nome");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: allMembers } = useQuery({
    queryKey: ["entra-role-members-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_role_members" as any).select("*");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: roleMembers } = useQuery({
    queryKey: ["entra-role-members", selectedRole?.id],
    enabled: !!selectedRole,
    queryFn: async () => {
      const { data, error } = await supabase.from("entra_role_members" as any).select("*").eq("role_id", selectedRole.id).order("user_display_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-entra-roles");
      if (error) throw error;
      toast.success(`Sincronização concluída: ${data.roles} roles, ${data.members} membros`);
      refetch();
    } catch (err: any) {
      toast.error("Erro na sincronização: " + (err.message || "Erro desconhecido"));
    } finally {
      setSyncing(false);
    }
  };

  const memberCountMap = new Map<string, number>();
  (allMembers || []).forEach((m: any) => {
    memberCountMap.set(m.role_id, (memberCountMap.get(m.role_id) || 0) + 1);
  });

  const filtered = (roles || []).filter((r: any) => {
    if (onlyPrivileged && !r.is_privileged) return false;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="h-6 w-6 text-amber-500" /> Acessos Privilegiados</h1>
          <p className="text-muted-foreground">Funções administrativas do Microsoft Entra ID e seus membros</p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar com Entra ID"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total de Roles</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalRoles}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Privilegiadas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-500">{privilegedRoles}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total de Atribuições</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalAssignments}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Usuários Únicos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{uniqueUsers}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
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
                  <EmptyState message={totalRoles === 0 ? "Nenhuma role sincronizada. Clique em \"Sincronizar com Entra ID\" para importar." : "Nenhuma role encontrada com os filtros aplicados."} />
                </TableCell></TableRow>
              ) : paginated.map((role: any) => {
                const count = memberCountMap.get(role.id) || 0;
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
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={count > 3 && role.is_privileged ? "text-destructive font-semibold" : ""}>{count}</span>
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

      <Dialog open={!!selectedRole} onOpenChange={(o) => !o && setSelectedRole(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
                    <TableHead>Vinculado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleMembers.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.user_display_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{m.user_email || "—"}</TableCell>
                      <TableCell>
                        {m.colaborador_id ? (
                          <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => { setSelectedRole(null); navigate(`/colaboradores/${m.colaborador_id}`); }}>
                            <LinkIcon className="h-3.5 w-3.5 mr-1" />Ver colaborador
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">Não vinculado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
