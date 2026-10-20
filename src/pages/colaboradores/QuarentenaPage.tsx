import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/hooks/useRole";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const MOTIVOS: Record<string, { label: string; dica: string }> = {
  duplicado_no_csv: { label: "Duplicado na base do RH", dica: "A mesma matrícula aparece mais de uma vez no arquivo do RH. Corrija no RH ou descarte." },
  matricula_ambigua: { label: "Matrícula com pessoas diferentes", dica: "A matrícula está associada a mais de uma pessoa. Confirme com o RH qual é a correta." },
  ausente_no_csv: { label: "Não veio no arquivo do RH", dica: "A pessoa está ativa aqui, mas sumiu da base do RH. Verifique se foi desligada." },
  erro_atualizacao: { label: "Erro ao atualizar", dica: "A atualização desta pessoa falhou na importação." },
  leaver_bloqueado: { label: "Desligamento bloqueado", dica: "O desligamento foi bloqueado por uma regra de proteção (ex.: exceção ativa)." },
};
const PAGE = 25;

export default function QuarentenaPage() {
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["colab_quarentena", "todas"],
    queryFn: async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as Row).from("colab_quarentena").select("id, motivo, nome, matricula, email, detalhe, created_at")
          .eq("status", "pendente").order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const counts = useMemo(() => data.reduce((a: Record<string, number>, r: Row) => ({ ...a, [r.motivo]: (a[r.motivo] ?? 0) + 1 }), {}), [data]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.filter((r: Row) => (!motivo || r.motivo === motivo) && (!t || [r.nome, r.matricula, r.email].some((v) => String(v ?? "").toLowerCase().includes(t))));
  }, [data, q, motivo]);
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const decidir = async (id: string, status: "resolvido" | "descartado") => {
    setBusy(id);
    const { data: r, error } = await (supabase.rpc as Row)("quarentena_decidir", { p_id: id, p_status: status, p_observacao: null });
    setBusy(null);
    if (error || !r?.ok) { toast.error("Não foi possível registrar a decisão", { description: error?.message ?? r?.error }); return; }
    toast.success(status === "resolvido" ? "Marcado como resolvido" : "Pendência descartada");
    qc.invalidateQueries({ queryKey: ["colab_quarentena"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Precisa de você"
        description="Pendências da base do RH que o Hermes não conseguiu decidir sozinho. Repetições e casos óbvios são resolvidos automaticamente."
        actions={<AutoUpdatedHint tasks="quarantine-triage" />}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={motivo === "" ? "default" : "outline"} onClick={() => { setMotivo(""); setPage(0); }}>Todos ({data.length})</Button>
        {Object.entries(counts).map(([m, n]) => (
          <Button key={m} size="sm" variant={motivo === m ? "default" : "outline"} onClick={() => { setMotivo(m); setPage(0); }}>{MOTIVOS[m]?.label ?? m} ({n as number})</Button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, matrícula ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Carregando…</p> : rows.length === 0 ? <EmptyState message="Nenhuma pendência. Tudo em dia." size="lg" /> : (
          <ul className="divide-y">
            {rows.map((r: Row) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.nome || "Sem nome"} <span className="text-muted-foreground">· matrícula {r.matricula || "—"}</span></p>
                  <p className="text-xs text-muted-foreground">{MOTIVOS[r.motivo]?.dica ?? r.detalhe}</p>
                  <div className="mt-1 flex gap-2"><Badge variant="outline">{MOTIVOS[r.motivo]?.label ?? r.motivo}</Badge><span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span></div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decidir(r.id, "descartado")}><X className="mr-1 h-4 w-4" />Descartar</Button>
                    <Button size="sm" disabled={busy === r.id} onClick={() => decidir(r.id, "resolvido")}><Check className="mr-1 h-4 w-4" />Resolvido</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      {filtered.length > PAGE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} de {filtered.length}</span>
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
