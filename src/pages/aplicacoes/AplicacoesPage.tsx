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
import MetricStrip from "@/components/MetricStrip";
import ConfirmImpactDialog from "@/components/ConfirmImpactDialog";
import { MODOS_ACESSO, situacaoSistema } from "@/lib/appConnect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const SITUACAO: Record<string, { label: string; cls: string }> = {
  conectado: { label: "Conectado", cls: "bg-success/15 text-success border-success/30" },
  demo: { label: "Conectado — demonstração", cls: "bg-warning/15 text-warning border-warning/30" },
  falhou: { label: "Falhou", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  aguardando: { label: "Aguardando teste", cls: "bg-info/15 text-info border-info/30" },
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
};
const DOT: Record<string, string> = { conectado: "bg-success", demo: "bg-warning", falhou: "bg-destructive", aguardando: "bg-info", rascunho: "bg-muted-foreground/50" };
const MODO_CLS: Record<string, string> = { grupo: "bg-success/15 text-success", api: "bg-info/15 text-info", manual: "bg-warning/15 text-warning", sso: "bg-primary/15 text-primary" };

function Pessoa({ label, nome }: { label: string; nome: string | null }) {
  const ini = nome ? nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "?";
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${nome ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning"}`}>{ini}</span>
        <span className={`truncate text-sm ${nome ? "" : "text-warning"}`}>{nome ?? `Sem ${label.toLowerCase()}`}</span>
      </div>
    </div>
  );
}
const MODO_LABEL: Record<string, string> = { ...Object.fromEntries(MODOS_ACESSO.map((m) => [m.value, m.label.replace("Por ", "")])), sso: "SSO" };

export default function AplicacoesPage() {
  const canEdit = useIsSuperAdmin();
  const { data: apps, isLoading } = useAplicacoes();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todas");
  const [modo, setModo] = useState("todos");

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
    if (modo !== "todos" && a.modo_acesso !== modo) return false;
    if (busca && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    const s = situacaoSistema(a);
    if (filtro === "incompletos" && (s === "conectado" || s === "demo" || s === "aguardando")) return false;
    if (filtro === "falhou" && s !== "falhou") return false;
    if (filtro === "conectado" && s !== "conectado") return false;
    if (filtro === "demo" && s !== "demo") return false;
    return true;
  });
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const conectados = allApps.filter((a) => situacaoSistema(a) === "conectado").length;
  const emDemo = allApps.filter((a) => situacaoSistema(a) === "demo").length;
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

      <MetricStrip items={[
        { label: "Total", n: allApps.length, f: "todas", tone: "primary" as const },
        { label: "Conectados", n: conectados, f: "conectado" },
        { label: "Demonstração", n: emDemo, f: "demo", tone: "warning" as const },
        { label: "Com falha", n: falhas, f: "falhou", tone: "danger" as const },
        { label: "Incompletos", n: rascunhos, f: "incompletos", tone: "warning" as const },
      ].map((k) => ({ label: k.label, value: k.n, tone: k.tone, active: filtro === k.f, onClick: () => { setFiltro(filtro === k.f ? "todas" : k.f); setPage(1); } }))} />

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar sistemas..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={modo} onValueChange={(v) => { setModo(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(MODO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtro} onValueChange={(v) => { setFiltro(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            <SelectItem value="conectado">Conectados</SelectItem>
            <SelectItem value="demo">Conectados (demo)</SelectItem>
            <SelectItem value="falhou">Com falha</SelectItem>
            <SelectItem value="incompletos">Incompletos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}</div>
      ) : paginatedItems.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <EmptyState message="Nenhum sistema encontrado" size="lg" />
          <p className="mt-1 text-sm text-muted-foreground">Cadastre os sistemas da empresa pelo botão "Conectar sistema"</p>
          {canEdit && <Button className="mt-4" onClick={() => navigate("/aplicacoes/conectar")}><Plus className="mr-1 h-4 w-4" />Conectar sistema</Button>}
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {paginatedItems.map((app: Row) => {
            const sit = situacaoSistema(app);
            const s = SITUACAO[sit];
            const modoCls = MODO_CLS[app.modo_acesso] ?? "bg-muted text-muted-foreground";
            const dono = nome(app.owner_colaborador_id) ?? app.owner ?? null;
            const rev = nome(app.revisor_colaborador_id);
            return (
              <div key={app.id} role="button" tabIndex={0} onClick={() => navigate(`/aplicacoes/${app.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/aplicacoes/${app.id}`)}
                className="group relative cursor-pointer rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]">
                {canEdit && <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar ficha" onClick={(e) => { e.stopPropagation(); navigate(`/aplicacoes/${app.id}/conectar`); }}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Excluir" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id); }}><Trash2 className="h-3 w-3" /></Button>
                </div>}
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center"><AppIcon url={app.url} origem={app.origem} size={44} /></div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="truncate font-semibold">{app.nome}</p>
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${modoCls}`}>{MODO_LABEL[app.modo_acesso] ?? "Sem tipo"}</span>
                    <p className="flex items-center gap-1.5 text-sm" title={sit === "demo" ? "Apresentação visual; conector não homologado." : app.teste_detalhe ?? undefined}>
                      <span className={`h-2.5 w-2.5 rounded-full ${DOT[sit] ?? "bg-muted-foreground"}`} />{s.label}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Pessoa label="Dono" nome={dono} />
                  <Pessoa label="Revisor" nome={rev} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">{list.length} {list.length === 1 ? "aplicação" : "aplicações"}</span>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} pageSizeOptions={[12, 24, 48]} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>

      <ConfirmImpactDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}
        title={`Excluir ${allApps.find((a) => a.id === deleteId)?.nome ?? "sistema"}?`}
        description="Esta ação não pode ser desfeita."
        impacts={[
          { icon: FileEdit, title: "Apaga a ficha do sistema", detail: "Dono, revisor, forma de acesso e conversa de cadastro." },
          { icon: Globe, title: "Desfaz a ligação com os perfis de acesso", detail: "Os cargos deixam de receber este sistema." },
        ]}
        confirmLabel="Excluir" confirmIcon={Trash2} onConfirm={handleDelete} />
    </div>
  );
}
