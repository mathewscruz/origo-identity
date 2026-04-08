import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Plus, Clock, CheckCircle2, XCircle, Send, FileText, AppWindow, Users } from "lucide-react";
import { format } from "date-fns";
import EmptyState from "@/components/EmptyState";

export default function PortalSolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [aplicacoes, setAplicacoes] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [buscaApp, setBuscaApp] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    const [solRes, appRes, grpRes] = await Promise.all([
      supabase
        .from("solicitacoes_acesso")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false }),
      supabase.from("aplicacoes").select("id, nome").order("nome"),
      supabase.from("entra_grupos").select("id, nome").order("nome"),
    ]);
    setSolicitacoes(solRes.data ?? []);
    setAplicacoes(appRes.data ?? []);
    setGrupos(grpRes.data ?? []);
    setLoading(false);
  }

  // Build maps for display
  const appMap = new Map(aplicacoes.map(a => [a.id, a.nome]));
  const grupoMap = new Map(grupos.map(g => [g.id, g.nome]));

  const getItensSolicitados = (s: any) => {
    const items: string[] = [];
    const appIds = Array.isArray(s.aplicacoes_ids) ? s.aplicacoes_ids : [];
    const grpIds = Array.isArray(s.grupos_ids) ? s.grupos_ids : [];
    appIds.forEach((id: string) => items.push(`📱 ${appMap.get(id) || id}`));
    grpIds.forEach((id: string) => items.push(`👥 ${grupoMap.get(id) || id}`));
    if (items.length === 0 && s.perfil_id) return "Perfil de acesso";
    return items.join(", ") || "—";
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pendente: { label: "Pendente", variant: "secondary" },
      em_aprovacao: { label: "Em Aprovação", variant: "outline" },
      aprovada: { label: "Aprovada", variant: "default" },
      rejeitada: { label: "Rejeitada", variant: "destructive" },
    };
    const info = map[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const toggleApp = (id: string) => {
    setSelectedApps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleGrupo = (id: string) => {
    setSelectedGrupos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (selectedApps.length === 0 && selectedGrupos.length === 0) {
      toast({ title: "Selecione ao menos uma aplicação ou grupo", variant: "destructive" });
      return;
    }
    if (!justificativa.trim()) {
      toast({ title: "Preencha a justificativa", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    let solicitanteId: string | null = null;
    if (userEmail) {
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("email", userEmail)
        .maybeSingle();
      solicitanteId = colab?.id ?? null;
    }

    if (!solicitanteId) {
      toast({ title: "Erro", description: "Não foi possível encontrar seu cadastro de colaborador.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      perfil_id: null,
      aplicacoes_ids: selectedApps,
      grupos_ids: selectedGrupos,
      justificativa: justificativa.trim(),
      status: "pendente",
      user_id: userId,
    } as any);

    if (error) {
      toast({ title: "Erro ao enviar solicitação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Solicitação enviada com sucesso!" });
      setDialogOpen(false);
      setSelectedApps([]);
      setSelectedGrupos([]);
      setJustificativa("");
      setBuscaApp("");
      setBuscaGrupo("");
      fetchData();
    }
    setSubmitting(false);
  };

  const totais = {
    total: solicitacoes.length,
    pendentes: solicitacoes.filter(s => s.status === "pendente" || s.status === "em_aprovacao").length,
    aprovadas: solicitacoes.filter(s => s.status === "aprovada").length,
    rejeitadas: solicitacoes.filter(s => s.status === "rejeitada").length,
  };

  // Sort: selected items first
  const filteredApps = aplicacoes
    .filter(a => !buscaApp || a.nome.toLowerCase().includes(buscaApp.toLowerCase()))
    .sort((a, b) => {
      const aS = selectedApps.includes(a.id) ? 0 : 1;
      const bS = selectedApps.includes(b.id) ? 0 : 1;
      return aS - bS || a.nome.localeCompare(b.nome);
    });

  const filteredGrupos = grupos
    .filter(g => !buscaGrupo || g.nome.toLowerCase().includes(buscaGrupo.toLowerCase()))
    .sort((a, b) => {
      const aS = selectedGrupos.includes(a.id) ? 0 : 1;
      const bS = selectedGrupos.includes(b.id) ? 0 : 1;
      return aS - bS || a.nome.localeCompare(b.nome);
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Minhas Solicitações</h1>
          <p className="text-muted-foreground">Acompanhe suas solicitações de acesso</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Solicitação
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{totais.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{totais.pendentes}</p>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{totais.aprovadas}</p>
              <p className="text-sm text-muted-foreground">Aprovadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{totais.rejeitadas}</p>
              <p className="text-sm text-muted-foreground">Rejeitadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : solicitacoes.length === 0 ? (
            <div className="p-8">
              <Send className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>Você ainda não possui solicitações.</p>
              <p className="text-sm">Clique em "Nova Solicitação" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Itens Solicitados</TableHead>
                  <TableHead className="hidden md:table-cell">Justificativa</TableHead>
                  <TableHead className="hidden sm:table-cell">Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Comentário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(s.aplicacoes_ids) ? s.aplicacoes_ids : []).map((id: string) => (
                          <Badge key={id} variant="outline" className="text-xs">
                            <AppWindow className="mr-1 h-3 w-3" />
                            {appMap.get(id) || id}
                          </Badge>
                        ))}
                        {(Array.isArray(s.grupos_ids) ? s.grupos_ids : []).map((id: string) => (
                          <Badge key={id} variant="secondary" className="text-xs">
                            <Users className="mr-1 h-3 w-3" />
                            {grupoMap.get(id) || id}
                          </Badge>
                        ))}
                        {!(s.aplicacoes_ids?.length || s.grupos_ids?.length) && s.perfil_id && (
                          <span className="text-muted-foreground">Perfil de acesso</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate hidden md:table-cell">{s.justificativa}</TableCell>
                    <TableCell className="hidden sm:table-cell">{format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="max-w-xs truncate hidden lg:table-cell">{s.comentario || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Solicitação de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Aplicações */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <AppWindow className="h-4 w-4" /> Aplicações
                {selectedApps.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{selectedApps.length} selecionada(s)</Badge>
                )}
              </label>
              <Input
                placeholder="Buscar aplicação..."
                value={buscaApp}
                onChange={(e) => setBuscaApp(e.target.value)}
              />
              <ScrollArea className="h-40 rounded-md border p-2">
                {filteredApps.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                    <Checkbox
                      checked={selectedApps.includes(a.id)}
                      onCheckedChange={() => toggleApp(a.id)}
                    />
                    <span className="text-sm">{a.nome}</span>
                  </label>
                ))}
                {filteredApps.length === 0 && (
                  <EmptyState message="Nenhuma aplicação encontrada" size="sm" />
                )}
              </ScrollArea>
            </div>

            {/* Grupos */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Grupos
                {selectedGrupos.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{selectedGrupos.length} selecionado(s)</Badge>
                )}
              </label>
              <Input
                placeholder="Buscar grupo..."
                value={buscaGrupo}
                onChange={(e) => setBuscaGrupo(e.target.value)}
              />
              <ScrollArea className="h-40 rounded-md border p-2">
                {filteredGrupos.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                    <Checkbox
                      checked={selectedGrupos.includes(g.id)}
                      onCheckedChange={() => toggleGrupo(g.id)}
                    />
                    <span className="text-sm">{g.nome}</span>
                  </label>
                ))}
                {filteredGrupos.length === 0 && (
                  <EmptyState message="Nenhum grupo encontrado" size="sm" />
                )}
              </ScrollArea>
            </div>

            {/* Justificativa */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Descreva o motivo da solicitação..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
