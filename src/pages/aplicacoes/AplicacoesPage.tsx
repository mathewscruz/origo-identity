import { useState } from "react";
import { useIsSuperAdmin } from "@/hooks/useRole";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2, Globe, CheckCircle2, AlertTriangle, FileEdit } from "lucide-react";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import { useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import AppIcon from "@/components/AppIcon";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { MODOS_ACESSO, situacaoSistema } from "@/lib/appConnect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const SITUACAO: Record<string, { label: string; cls: string }> = {
  conectado: { label: "Conectado", cls: "bg-success/15 text-success border-success/30" },
  falhou: { label: "Falhou", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  aguardando: { label: "Aguardando teste", cls: "bg-info/15 text-info border-info/30" },
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
};
const MODO_LABEL: Record<string, string> = { ...Object.fromEntries(MODOS_ACESSO.map((m) => [m.value, m.label.replace("Por ", "")])), sso: "SSO" };

export default function AplicacoesPage() {
  const canEdit = useIsSuperAdmin();
  const { data: apps, isLoading } = useAplicacoes();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todas");

  const { data: colabs } = useQuery({
    queryKey: ["aplicacoes_responsaveis", (apps ?? []).map((a: Row) => a.revisor_colaborador_id).join(",")],
    enabled: !!apps?.length,
    queryFn: async () => {
      const ids = [...new Set((apps ?? []).flatMap((a: Row) => [a.owner_colaborador_id, a.revisor_colaborador_id]).filter(Boolean))] as string[];
      if (!ids.length) return {} as Record<string, string>;
      const { data } = await supabase.from("colaboradores").select("id, nome").in("id", ids);
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.nome])) as Record<string, string>;
    },
  });

  const allApps = (apps ?? []) as Row[];
  const list = allApps.filter((a) => {
    if (busca && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    const s = situacaoSistema(a);
    if (filtro === "incompletos" && (s === "conectado" || s === "aguardando")) return false;
    if (filtro === "falhou" && s !== "falhou") return false;
    if (filtro === "conectado" && s !== "conectado") return false;
    return true;
  });
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const conectados = allApps.filter((a) => situacaoSistema(a) === "conectado").length;
  const falhas = allApps.filter((a) => situacaoSistema(a) === "falhou").length;
  const rascunhos = allApps.filter((a) => situacaoSistema(a) === "rascunho").length;

  const handleDelete = async () => {
    if (!deleteId) return;
    const app = allApps.find((a) => a.id === deleteId);
    const { error } = await supabase.from("aplicacoes").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_aplicacao", entidade: "aplicacoes", entidade_id: deleteId, resumo: `Excluída: ${app?.nome}` });
    toast({ title: "Sistema excluído" });
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
    setDeleteId(null);
  };

  const nome = (id?: string | null) => (id ? colabs?.[id] ?? "…" : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aplicações"
        description="Sistemas conectados ao IAM, com dono, revisor e forma de acesso"
        actions={<div className="flex items-center gap-3">
          <AutoUpdatedHint tasks="sync-app-profiles" />
          {canEdit && <Button onClick={() => navigate("/aplicacoes/conectar")}><Plus className="mr-1 h-4 w-4" />Conectar sistema</Button>}
        </div>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { icon: Globe, n: allApps.length, l: "Total", c: "primary", f: "todas" },
          { icon: CheckCircle2, n: conectados, l: "Conectados", c: "success", f: "conectado" },
          { icon: AlertTriangle, n: falhas, l: "Com falha", c: "destructive", f: "falhou" },
          { icon: FileEdit, n: rascunhos, l: "Incompletos", c: "warning", f: "incompletos" },
        ].map((k) => (
          <Card key={k.l} className="cursor-pointer hover:bg-muted/40" onClick={() => { setFiltro(k.f); setPage(1); }}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${k.c}/10`}><k.icon className={`h-5 w-5 text-${k.c}`} /></div>
              <div><p className="text-2xl font-bold">{k.n}</p><p className="text-xs text-muted-foreground">{k.l}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar sistemas..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={filtro} onValueChange={(v) => { setFiltro(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos</SelectItem>
            <SelectItem value="conectado">Conectados</SelectItem>
            <SelectItem value="falhou">Com falha</SelectItem>
            <SelectItem value="incompletos">Incompletos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : paginatedItems.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState message="Nenhum sistema encontrado" size="lg" />
            <p className="mt-1 text-sm text-muted-foreground">Cadastre os sistemas da empresa pelo botão "Conectar sistema"</p>
            {canEdit && <Button className="mt-4" onClick={() => navigate("/aplicacoes/conectar")}><Plus className="mr-1 h-4 w-4" />Conectar sistema</Button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground">
              <th className="p-4 font-medium">Sistema</th>
              <th className="hidden p-4 font-medium md:table-cell">Acesso</th>
              <th className="hidden p-4 font-medium md:table-cell">Dono</th>
              <th className="hidden p-4 font-medium lg:table-cell">Revisor</th>
              <th className="p-4 font-medium">Situação</th>
              {canEdit && <th className="w-20 p-4 font-medium">Ações</th>}
            </tr></thead>
            <tbody>
              {paginatedItems.map((app: Row) => {
                const s = SITUACAO[situacaoSistema(app)];
                return (
                  <tr key={app.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => navigate(`/aplicacoes/${app.id}`)}>
                    <td className="p-4 font-medium text-primary"><div className="flex items-center gap-2"><AppIcon url={app.url} origem={app.origem} size={20} />{app.nome}</div></td>
                    <td className="hidden p-4 md:table-cell"><Badge variant="outline">{MODO_LABEL[app.modo_acesso] ?? "—"}</Badge></td>
                    <td className="hidden p-4 text-muted-foreground md:table-cell">{nome(app.owner_colaborador_id) ?? app.owner ?? <span className="text-warning">Sem dono</span>}</td>
                    <td className="hidden p-4 text-muted-foreground lg:table-cell">{nome(app.revisor_colaborador_id) ?? <span className="text-warning">Sem revisor</span>}</td>
                    <td className="p-4"><Badge variant="outline" className={s.cls} title={app.teste_detalhe ?? undefined}>{s.label}</Badge></td>
                    {canEdit && <td className="p-4"><div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar ficha" onClick={(e) => { e.stopPropagation(); navigate(`/aplicacoes/${app.id}/conectar`); }}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir sistema?</AlertDialogTitle><AlertDialogDescription>A ficha e a conversa serão apagadas. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
