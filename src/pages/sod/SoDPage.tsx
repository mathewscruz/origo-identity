import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";
import { ShieldAlert, Plus, Trash2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SoDConflito {
  id: string;
  perfil_a_id: string;
  perfil_b_id: string;
  descricao: string | null;
  severidade: string;
  ativo: boolean;
  created_at: string;
}

interface Perfil {
  id: string;
  nome: string;
  tipo: string;
}

interface Violacao {
  colaborador_id: string;
  colaborador_nome: string;
  perfil_a_nome: string;
  perfil_b_nome: string;
  conflito_id: string;
  severidade: string;
}

export default function SoDPage() {
  const { profile } = useAuth();
  const [conflitos, setConflitos] = useState<SoDConflito[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaViolacao, setBuscaViolacao] = useState("");

  // form
  const [perfilAId, setPerfilAId] = useState("");
  const [perfilBId, setPerfilBId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [severidade, setSeveridade] = useState("alto");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("sod_conflitos").select("*").order("created_at", { ascending: false }),
      supabase.from("perfis_acesso").select("id, nome, tipo").eq("ativo", true).order("nome"),
    ]);
    setConflitos(c || []);
    setPerfis(p || []);

    // Detect violations
    if (c && c.length > 0) {
      const activeConflicts = c.filter((x: SoDConflito) => x.ativo);
      if (activeConflicts.length > 0) {
        await detectViolacoes(activeConflicts, p || []);
      } else {
        setViolacoes([]);
      }
    } else {
      setViolacoes([]);
    }
    setLoading(false);
  };

  const detectViolacoes = async (activeConflicts: SoDConflito[], perfisList: Perfil[]) => {
    // Get all active atribuicoes
    const allAtrib: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("perfil_atribuicoes")
        .select("colaborador_id, perfil_id")
        .eq("ativo", true)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allAtrib.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // Group by colaborador
    const byColab = new Map<string, Set<string>>();
    for (const a of allAtrib) {
      if (!a.colaborador_id) continue;
      if (!byColab.has(a.colaborador_id)) byColab.set(a.colaborador_id, new Set());
      byColab.get(a.colaborador_id)!.add(a.perfil_id);
    }

    const perfilMap = new Map(perfisList.map(p => [p.id, p.nome]));
    const found: Violacao[] = [];

    for (const conflict of activeConflicts) {
      for (const [colabId, perfilIds] of byColab) {
        if (perfilIds.has(conflict.perfil_a_id) && perfilIds.has(conflict.perfil_b_id)) {
          found.push({
            colaborador_id: colabId,
            colaborador_nome: "",
            perfil_a_nome: perfilMap.get(conflict.perfil_a_id) || "—",
            perfil_b_nome: perfilMap.get(conflict.perfil_b_id) || "—",
            conflito_id: conflict.id,
            severidade: conflict.severidade,
          });
        }
      }
    }

    // Fetch collaborator names
    if (found.length > 0) {
      const uniqueIds = [...new Set(found.map(v => v.colaborador_id))];
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueIds.length; i += 50) chunks.push(uniqueIds.slice(i, i + 50));
      const nameMap = new Map<string, string>();
      for (const chunk of chunks) {
        const { data } = await supabase.from("colaboradores").select("id, nome").in("id", chunk);
        data?.forEach((c: any) => nameMap.set(c.id, c.nome));
      }
      found.forEach(v => { v.colaborador_nome = nameMap.get(v.colaborador_id) || "Desconhecido"; });
    }

    setViolacoes(found);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!perfilAId || !perfilBId) {
      toast({ title: "Selecione os dois perfis", variant: "destructive" });
      return;
    }
    if (perfilAId === perfilBId) {
      toast({ title: "Os perfis devem ser diferentes", variant: "destructive" });
      return;
    }

    // Normalize order to prevent duplicates
    const [a, b] = [perfilAId, perfilBId].sort();
    const { error } = await supabase.from("sod_conflitos").insert({
      perfil_a_id: a,
      perfil_b_id: b,
      descricao: descricao || null,
      severidade,
    } as any);

    if (error) {
      toast({ title: "Erro ao criar conflito", description: error.message, variant: "destructive" });
      return;
    }

    await logAuditoria({
      acao: "criar",
      entidade: "sod_conflito",
      resumo: `Conflito SoD criado: ${perfis.find(p => p.id === a)?.nome} × ${perfis.find(p => p.id === b)?.nome}`,
      operador: profile?.email || "sistema",
    });

    toast({ title: "Conflito SoD criado com sucesso" });
    setDialogOpen(false);
    setPerfilAId("");
    setPerfilBId("");
    setDescricao("");
    setSeveridade("alto");
    fetchData();
  };

  const handleDelete = async (conflito: SoDConflito) => {
    const { error } = await supabase.from("sod_conflitos").delete().eq("id", conflito.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    await logAuditoria({
      acao: "excluir",
      entidade: "sod_conflito",
      entidade_id: conflito.id,
      resumo: "Conflito SoD excluído",
      operador: profile?.email || "sistema",
    });
    toast({ title: "Conflito excluído" });
    fetchData();
  };

  const handleToggle = async (conflito: SoDConflito) => {
    await supabase.from("sod_conflitos").update({ ativo: !conflito.ativo } as any).eq("id", conflito.id);
    fetchData();
  };

  const perfilMap = useMemo(() => new Map(perfis.map(p => [p.id, p])), [perfis]);

  const filteredConflitos = conflitos.filter(c => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    const pA = perfilMap.get(c.perfil_a_id)?.nome?.toLowerCase() || "";
    const pB = perfilMap.get(c.perfil_b_id)?.nome?.toLowerCase() || "";
    return pA.includes(q) || pB.includes(q) || (c.descricao || "").toLowerCase().includes(q);
  });

  const filteredViolacoes = violacoes.filter(v => {
    if (!buscaViolacao) return true;
    const q = buscaViolacao.toLowerCase();
    return v.colaborador_nome.toLowerCase().includes(q) || v.perfil_a_nome.toLowerCase().includes(q) || v.perfil_b_nome.toLowerCase().includes(q);
  });

  const countCritico = violacoes.filter(v => v.severidade === "critico").length;
  const countAlto = violacoes.filter(v => v.severidade === "alto").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SoD / Conflitos de Acesso</h1>
          <p className="text-muted-foreground">Segregation of Duties — defina perfis que não podem coexistir</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo Conflito</Button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{conflitos.length}</p><p className="text-xs text-muted-foreground">Regras SoD</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{violacoes.length}</p><p className="text-xs text-muted-foreground">Violações Ativas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center"><span className="text-destructive font-bold text-sm">{countCritico}</span></div>
          <div><p className="text-xs text-muted-foreground">Críticas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center"><span className="text-orange-600 font-bold text-sm">{countAlto}</span></div>
          <div><p className="text-xs text-muted-foreground">Altas</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="regras">
        <TabsList>
          <TabsTrigger value="regras">Regras SoD ({conflitos.length})</TabsTrigger>
          <TabsTrigger value="violacoes">
            Violações Atuais
            {violacoes.length > 0 && <Badge variant="destructive" className="ml-2">{violacoes.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="regras" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar conflitos..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Perfil A</TableHead>
                <TableHead>Perfil B</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filteredConflitos.length === 0 ? (
                  <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum conflito cadastrado" /></TableCell></TableRow>
                ) : filteredConflitos.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{perfilMap.get(c.perfil_a_id)?.nome || "—"}</TableCell>
                    <TableCell className="font-medium">{perfilMap.get(c.perfil_b_id)?.nome || "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{c.descricao || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.severidade === "critico" ? "destructive" : "outline"} className={c.severidade === "alto" ? "border-orange-500 text-orange-600" : ""}>
                        {c.severidade}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.ativo ? "default" : "secondary"} className="cursor-pointer" onClick={() => handleToggle(c)}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="violacoes" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar violações..." value={buscaViolacao} onChange={e => setBuscaViolacao(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Perfil A</TableHead>
                <TableHead>Perfil B</TableHead>
                <TableHead>Severidade</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filteredViolacoes.length === 0 ? (
                  <TableRow><TableCell colSpan={4}>
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <span>Nenhuma violação detectada</span>
                    </div>
                  </TableCell></TableRow>
                ) : filteredViolacoes.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{v.colaborador_nome}</TableCell>
                    <TableCell>{v.perfil_a_nome}</TableCell>
                    <TableCell>{v.perfil_b_nome}</TableCell>
                    <TableCell>
                      <Badge variant={v.severidade === "critico" ? "destructive" : "outline"} className={v.severidade === "alto" ? "border-orange-500 text-orange-600" : ""}>
                        {v.severidade}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog novo conflito */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Conflito SoD</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Perfil A</label>
              <Select value={perfilAId} onValueChange={setPerfilAId}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil A" /></SelectTrigger>
                <SelectContent>
                  {perfis.filter(p => p.id !== perfilBId).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} ({p.tipo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Perfil B (conflita com A)</label>
              <Select value={perfilBId} onValueChange={setPerfilBId}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil B" /></SelectTrigger>
                <SelectContent>
                  {perfis.filter(p => p.id !== perfilAId).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} ({p.tipo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Severidade</label>
              <Select value={severidade} onValueChange={setSeveridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critico">Crítico</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Contas a Pagar e Aprovação de Pagamentos não podem coexistir" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
