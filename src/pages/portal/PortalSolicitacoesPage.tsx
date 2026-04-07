import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Clock, CheckCircle2, XCircle, Send, FileText } from "lucide-react";
import { format } from "date-fns";

export default function PortalSolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [perfis, setPerfis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [perfilId, setPerfilId] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    const [solRes, perfRes] = await Promise.all([
      supabase
        .from("solicitacoes_acesso")
        .select("*, perfis_acesso:perfil_id(nome), colaboradores:solicitante_id(nome)")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false }),
      supabase.from("perfis_acesso").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setSolicitacoes(solRes.data ?? []);
    setPerfis(perfRes.data ?? []);
    setLoading(false);
  }

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

  const handleSubmit = async () => {
    if (!perfilId || !justificativa.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    // Find colaborador by user email
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
      toast({ title: "Erro", description: "Não foi possível encontrar seu cadastro de colaborador. Verifique se seu e-mail está vinculado.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      perfil_id: perfilId,
      justificativa: justificativa.trim(),
      status: "pendente",
      user_id: userId,
    } as any);

    if (error) {
      toast({ title: "Erro ao enviar solicitação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Solicitação enviada com sucesso!" });
      setDialogOpen(false);
      setPerfilId("");
      setJustificativa("");
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
            <div className="p-8 text-center text-muted-foreground">
              <Send className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>Você ainda não possui solicitações.</p>
              <p className="text-sm">Clique em "Nova Solicitação" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil Solicitado</TableHead>
                  <TableHead>Justificativa</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comentário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {(s as any).perfis_acesso?.nome || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{s.justificativa}</TableCell>
                    <TableCell>{format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="max-w-xs truncate">{s.comentario || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Solicitação de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Perfil de Acesso</label>
              <Select value={perfilId} onValueChange={setPerfilId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o perfil desejado" />
                </SelectTrigger>
                <SelectContent>
                  {perfis.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
