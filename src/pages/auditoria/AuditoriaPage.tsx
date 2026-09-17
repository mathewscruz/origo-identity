import { useEffect, useState } from "react";
import { Download, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TablePagination from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { ScrollText } from "lucide-react";
import { useAuditoriaFiltros, useAuditoriaPage } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import { humanize } from "@/lib/labels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const entidadeColors: Record<string, string> = {
  colaboradores: "bg-info/15 text-info border-info/30",
  terceiros: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  iam_queue: "bg-primary/15 text-primary border-primary/30",
  eventos_jml: "bg-success/15 text-success border-success/30",
  excecoes: "bg-warning/15 text-warning border-warning/30",
  parametros: "bg-destructive/15 text-destructive border-destructive/30",
  scheduler: "bg-muted text-muted-foreground",
};

export default function AuditoriaPage() {
  const [selected, setSelected] = useState<Row | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [entidade, setEntidade] = useState("todas");
  const [operador, setOperador] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { setPage(1); }, [buscaDebounced, entidade, operador]);

  const { data, isLoading } = useAuditoriaPage({ page, pageSize, search: buscaDebounced || undefined, entidade: entidade !== "todas" ? entidade : undefined, operador: operador !== "todos" ? operador : undefined });
  const { data: filtros } = useAuditoriaFiltros();
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      let q = (supabase as Row).from("auditoria").select("timestamp, operador, acao, entidade, entidade_id, resumo").order("timestamp", { ascending: false }).limit(5000);
      if (entidade !== "todas") q = q.eq("entidade", entidade);
      if (operador !== "todos") q = q.eq("operador", operador);
      if (buscaDebounced) { const safe = buscaDebounced.replace(/[%,()]/g, " "); q = q.or(`acao.ilike.%${safe}%,resumo.ilike.%${safe}%,operador.ilike.%${safe}%`); }
      const { data: all, error } = await q;
      if (error) throw error;
      if (!all?.length) { toast.warning("Nenhum registro para exportar"); return; }
      const headers = ["Timestamp", "Operador", "Ação", "Entidade", "Id", "Resumo"];
      const lines = (all as Row[]).map((a) => [new Date(a.timestamp).toLocaleString("pt-BR"), a.operador || "", a.acao, a.entidade, a.entidade_id || "", a.resumo || ""]);
      const csv = [headers.join(";"), ...lines.map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${all.length} registro(s) exportado(s)${all.length === 5000 ? " (limite de 5.000 — refine os filtros)" : ""}`);
    } catch (err) {
      toast.error("Erro ao exportar", { description: err instanceof Error ? err.message : String(err) });
    } finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Auditoria" icon={ScrollText} description="Trilha imutável de tudo o que aconteceu: quem fez, o quê, quando e em qual entidade. Inclui ações do Hermes, do Órigo Agente e dos jobs agendados." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Ação, resumo, operador ou id…" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={entidade} onValueChange={setEntidade}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as entidades</SelectItem>{(filtros?.entidades ?? []).map((e) => <SelectItem key={e} value={e}>{humanize(e)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={operador} onValueChange={setOperador}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os operadores</SelectItem>{(filtros?.operadores ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{total.toLocaleString("pt-BR")} registro(s)</span>
          <Button variant="outline" onClick={exportCsv} disabled={exporting}><Download className="mr-1 h-4 w-4" />{exporting ? "Exportando…" : "Exportar CSV"}</Button>
        </div>
      </div>

      <Card><CardContent className="p-0">
        {isLoading && rows.length === 0 ? (
          <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="py-10"><EmptyState message="Nenhum registro com esses filtros." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3 font-medium">Quando</th><th className="p-3 font-medium">Operador</th>
                <th className="p-3 font-medium">Ação</th><th className="p-3 font-medium hidden md:table-cell">Entidade</th>
                <th className="p-3 font-medium">Resumo</th><th className="p-3 font-medium"></th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[180px] truncate">{a.operador || "—"}</td>
                    <td className="p-3 font-medium">{humanize(a.acao)}</td>
                    <td className="p-3 hidden md:table-cell"><Badge variant="outline" className={entidadeColors[a.entidade] || ""}>{humanize(a.entidade)}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[420px] truncate" title={a.resumo || ""}>{a.resumo || "—"}</td>
                    <td className="p-3"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(a)}><Eye className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
      <TablePagination totalItems={total} pageSize={pageSize} currentPage={page} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{humanize(selected?.acao)} · {selected ? new Date(selected.timestamp).toLocaleString("pt-BR") : ""}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Operador</p><p>{selected.operador || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Entidade</p><p>{humanize(selected.entidade)}{selected.entidade_id ? <span className="ml-1 font-mono text-xs text-muted-foreground">{selected.entidade_id}</span> : null}</p></div>
              </div>
              <div><p className="text-xs text-muted-foreground">Resumo</p><p>{selected.resumo || "—"}</p></div>
              {selected.detalhes && <div><p className="mb-1 text-xs text-muted-foreground">Detalhes</p><pre className="max-h-[360px] overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(selected.detalhes, null, 2)}</pre></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
