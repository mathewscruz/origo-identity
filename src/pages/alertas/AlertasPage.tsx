import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useAlertas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { toast } from "sonner";
import EmptyState from "@/components/EmptyState";

const severidadeColors: Record<string, string> = {
  info: "bg-info/15 text-info border-info/30",
  aviso: "bg-warning/15 text-warning border-warning/30",
  critico: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AlertasPage() {
  const { data: alertas, isLoading } = useAlertas();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"nao_lidos" | "todos">("nao_lidos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const list = (alertas ?? []) as any[];
  const naoLidos = list.filter((a) => !a.lido);
  const filtered = tab === "nao_lidos" ? naoLidos : list;
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const marcarLido = async (id: string) => {
    const { error } = await supabase.from("alertas").update({ lido: true }).eq("id", id);
    if (error) {
      toast.error("Erro ao marcar alerta como lido", { description: error.message });
      return;
    }
    toast.success("Alerta marcado como lido");
    queryClient.invalidateQueries({ queryKey: ["alertas"] });
  };

  const marcarTodosLidos = async () => {
    const ids = naoLidos.map((a) => a.id);
    if (ids.length > 0) {
      const { error } = await supabase.from("alertas").update({ lido: true }).in("id", ids);
      if (error) {
        toast.error("Erro ao marcar alertas", { description: error.message });
        return;
      }
      toast.success(`${ids.length} alerta(s) marcado(s) como lido(s)`);
      queryClient.invalidateQueries({ queryKey: ["alertas"] });
    }
  };

  return (
    <div className="space-y-6">
      {naoLidos.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={marcarTodosLidos}>
            <CheckCheck className="mr-1 h-4 w-4" />Marcar todos como lidos
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "nao_lidos" | "todos"); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="nao_lidos">Não lidos ({naoLidos.length})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({list.length})</TabsTrigger>
        </TabsList>
        {["nao_lidos", "todos"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Severidade</th><th className="p-4 font-medium">Título</th>
                  <th className="p-4 font-medium">Mensagem</th><th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Ações</th>
                </tr></thead><tbody>
                  {paginatedItems.map((a: any) => (
                    <tr key={a.id} className={`border-b last:border-0 ${!a.lido ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                      <td className="p-4"><Badge variant="outline" className={severidadeColors[a.severidade]}>{a.severidade}</Badge></td>
                      <td className="p-4 font-medium">{!a.lido && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />}{a.titulo}</td>
                      <td className="p-4 text-muted-foreground text-xs max-w-[300px] truncate">{a.mensagem || "—"}</td>
                      <td className="p-4 text-xs text-muted-foreground">{new Date(a.data).toLocaleString("pt-BR")}</td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {!a.lido && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarLido(a.id)}>Marcar lido</Button>
                          )}
                          {a.ref_url && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <Link to={a.ref_url}><ExternalLink className="h-3 w-3" /></Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && <tr><td colSpan={5}><EmptyState message="Nenhum alerta." /></td></tr>}
                </tbody></table>
              )}
            </CardContent></Card>
            <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
