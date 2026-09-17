import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDbChange } from "@/hooks/useRealtimeSync";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Download, Search, Users, ShieldAlert } from "lucide-react";
import TablePagination from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";
import { humanize } from "@/lib/labels";

function exportCsv(headers: string[], rows: string[][], filename: string) {
  const bom = "\uFEFF";
  const csv = bom + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios e Compliance" description="Quem tem acesso a quê e acessos excessivos — atualizados em tempo real, exportáveis em CSV. Histórico de execução fica na Fila; contas órfãs, na aba de aprovação." />

      <Tabs defaultValue="acesso">
        <TabsList className="flex-wrap">
          <TabsTrigger value="acesso"><Users className="mr-1 h-4 w-4" />Quem tem acesso a quê</TabsTrigger>
          <TabsTrigger value="excessivos"><ShieldAlert className="mr-1 h-4 w-4" />Acessos Excessivos</TabsTrigger>
        </TabsList>

        <TabsContent value="acesso"><AcessoReport /></TabsContent>
        <TabsContent value="excessivos"><ExcessivosReport /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Quem tem acesso a quê ── */
function AcessoReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useDbChange(["perfil_atribuicoes","colaboradores","perfis_acesso","iam_queue","auditoria"], () => setTick((t) => t + 1));
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Get active atribuicoes
      const allAtrib: any[] = [];
      let from = 0;
      while (true) {
        const { data: d } = await supabase.from("perfil_atribuicoes").select("colaborador_id, perfil_id, origem, data_concessao").eq("ativo", true).range(from, from + 999);
        if (!d || d.length === 0) break;
        allAtrib.push(...d);
        if (d.length < 1000) break;
        from += 1000;
      }

      // Get names
      const colabIds = [...new Set(allAtrib.map(a => a.colaborador_id).filter(Boolean))];
      const perfilIds = [...new Set(allAtrib.map(a => a.perfil_id))];

      const colabMap = new Map<string, string>();
      for (let i = 0; i < colabIds.length; i += 50) {
        const { data: c } = await supabase.from("colaboradores").select("id, nome").in("id", colabIds.slice(i, i + 50));
        c?.forEach((x: any) => colabMap.set(x.id, x.nome));
      }

      const perfilMap = new Map<string, string>();
      for (let i = 0; i < perfilIds.length; i += 50) {
        const { data: p } = await supabase.from("perfis_acesso").select("id, nome").in("id", perfilIds.slice(i, i + 50));
        p?.forEach((x: any) => perfilMap.set(x.id, x.nome));
      }

      const rows = allAtrib.map(a => ({
        colaborador: colabMap.get(a.colaborador_id) || "—",
        perfil: perfilMap.get(a.perfil_id) || "—",
        origem: a.origem || "—",
        data: new Date(a.data_concessao).toLocaleDateString("pt-BR"),
      }));

      rows.sort((a, b) => a.colaborador.localeCompare(b.colaborador));
      setData(rows);
      setLoading(false);
    })();
  }, [tick]);

  const filtered = data.filter(r => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return r.colaborador.toLowerCase().includes(q) || r.perfil.toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const handleExport = () => {
    exportCsv(["Colaborador", "Perfil", "Origem", "Data Concessão"], filtered.map(r => [r.colaborador, r.perfil, r.origem, r.data]), "relatorio_acessos.csv");
    toast({ title: `${filtered.length} registros exportados` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador ou perfil..." value={busca} onChange={e => { setBusca(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Badge variant="secondary">{filtered.length} registros</Badge>
        <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Colaborador</TableHead>
            <TableHead>Perfil de Acesso</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Data Concessão</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : paged.length === 0 ? (
              <TableRow><TableCell colSpan={4}><EmptyState message="Nenhum registro" /></TableCell></TableRow>
            ) : paged.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.colaborador}</TableCell>
                <TableCell>{r.perfil}</TableCell>
                <TableCell><Badge variant="outline">{humanize(r.origem)}</Badge></TableCell>
                <TableCell>{r.data}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {filtered.length > perPage && <TablePagination totalItems={filtered.length} pageSize={perPage} currentPage={page} onPageChange={setPage} />}
    </div>
  );
}

/* ── Acessos Excessivos ── */
function ExcessivosReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useDbChange(["perfil_atribuicoes","colaboradores","perfis_acesso","iam_queue","auditoria"], () => setTick((t) => t + 1));
  const [limite, setLimite] = useState("5");
  const [busca, setBusca] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const allAtrib: any[] = [];
    let from = 0;
    while (true) {
      const { data: d } = await supabase.from("perfil_atribuicoes").select("colaborador_id, perfil_id").eq("ativo", true).range(from, from + 999);
      if (!d || d.length === 0) break;
      allAtrib.push(...d);
      if (d.length < 1000) break;
      from += 1000;
    }

    // Count per colaborador
    const counts = new Map<string, number>();
    for (const a of allAtrib) {
      if (!a.colaborador_id) continue;
      counts.set(a.colaborador_id, (counts.get(a.colaborador_id) || 0) + 1);
    }

    const lim = parseInt(limite) || 5;
    const excessive = [...counts.entries()].filter(([, c]) => c >= lim).sort((a, b) => b[1] - a[1]);

    if (excessive.length > 0) {
      const ids = excessive.map(([id]) => id);
      const nameMap = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 50) {
        const { data: c } = await supabase.from("colaboradores").select("id, nome").in("id", ids.slice(i, i + 50));
        c?.forEach((x: any) => nameMap.set(x.id, x.nome));
      }
      setData(excessive.map(([id, count]) => ({ id, nome: nameMap.get(id) || "—", perfis: count })));
    } else {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [limite, tick]);

  const filtered = data.filter(r => !busca || r.nome.toLowerCase().includes(busca.toLowerCase()));

  const handleExport = () => {
    exportCsv(["Colaborador", "Qtd Perfis"], filtered.map(r => [r.nome, r.perfis.toString()]), "acessos_excessivos.csv");
    toast({ title: `${filtered.length} registros exportados` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Mínimo de perfis:</span>
          <Select value={limite} onValueChange={setLimite}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary">{filtered.length} colaboradores</Badge>
        <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Colaborador</TableHead>
            <TableHead>Quantidade de Perfis</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={2}><EmptyState message="Nenhum colaborador com acesso excessivo" /></TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell><Badge variant="destructive">{r.perfis} perfis</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
