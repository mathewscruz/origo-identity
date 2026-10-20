import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Paperclip, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import HermesIcon from "@/components/icons/HermesIcon";
import { diagnosticoParaFicha, sanitizarDiagnostico, type ItemAplicavel } from "@/lib/appAnalysis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const ACEITOS = ".pdf,.doc,.docx,.txt,.md,.json,.yaml,.yml,.html";
const MODO_LABEL: Record<string, string> = { grupo: "Por grupo", api: "Por API", manual: "Manual" };

export function useAnalises(id: string) {
  return useQuery({
    queryKey: ["app_analises", id],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("agent_tasks").select("id, status, result, result_json, created_at, payload")
        .eq("task", "analyze-app-docs").eq("payload->>aplicacao_id", id).order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: (q) => ((q.state.data as Row[] | undefined)?.some((t) => t.status === "pending" || t.status === "running") ? 5000 : false),
  });
}

/** Botão de anexo: envia o arquivo e pede a análise ao Hermes. */
export function AnexarDocumento({ id, onSent }: { id: string; onSent: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) { toast.error("Arquivo maior que 10 MB"); return; }
    setEnviando(true);
    const path = `${id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from("app-docs").upload(path, f);
    if (up.error) { setEnviando(false); toast.error("Não foi possível enviar o arquivo", { description: up.error.message }); return; }
    const { error } = await (supabase.rpc as Row)("app_analise_solicitar", { p_aplicacao_id: id, p_arquivo_path: path, p_arquivo_nome: f.name });
    setEnviando(false);
    if (error) toast.error("Não foi possível pedir a análise ao Hermes", { description: error.message });
    else { toast.success("Arquivo enviado ao Hermes para análise"); onSent(); }
  };
  return (
    <>
      <input ref={ref} type="file" accept={ACEITOS} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviar(f); }} />
      <Button type="button" variant="ghost" size="sm" disabled={enviando} onClick={() => ref.current?.click()}>
        {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}Anexar documentação
      </Button>
    </>
  );
}

/** Cartão com o diagnóstico mais recente do Hermes. */
export function AnaliseHermesCard({ id, app, cfg, onApplied }: { id: string; app: Row; cfg: Record<string, unknown>; onApplied: () => void }) {
  const { data } = useAnalises(id);
  const t = data?.[0];
  const [marcados, setMarcados] = useState<ItemAplicavel[] | null>(null);
  const [aplicando, setAplicando] = useState(false);
  if (!t) return null;
  const fonte = t.payload?.arquivo_nome ?? t.payload?.url ?? "material enviado";

  if (t.status === "pending" || t.status === "running") {
    const atrasado = Date.now() - new Date(t.created_at).getTime() > 10 * 60000;
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs">
        <HermesIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="font-medium">{atrasado ? "Hermes ainda não respondeu" : "Hermes analisando…"}</p>
          <p className="break-all text-muted-foreground">{fonte}{atrasado ? " — você pode continuar a conversa normalmente." : ""}</p>
        </div>
      </div>
    );
  }
  if (t.status === "error") {
    return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs"><p className="font-medium text-destructive">O Hermes não conseguiu analisar</p><p className="text-muted-foreground">{t.result}</p></div>;
  }

  const d = sanitizarDiagnostico(t.result_json);
  const disponiveis: { k: ItemAplicavel; label: string; ok: boolean }[] = [
    { k: "modo" as ItemAplicavel, label: `Forma de acesso: ${d.modo_sugerido ? MODO_LABEL[d.modo_sugerido] : "—"}`, ok: !!d.modo_sugerido },
    { k: "api", label: `API: ${d.api_base_url ?? "—"}${d.auth_type ? ` (${d.auth_type})` : ""}`, ok: !!(d.api_base_url || d.auth_type) },
    { k: "acoes", label: `Ações: ${(["create", "disable", "lookup"] as const).filter((x) => d.actions?.[x]).map((x) => ({ create: "criar", disable: "desativar", lookup: "consultar" })[x]).join(", ") || "—"}`, ok: !!d.actions && Object.values(d.actions).some(Boolean) },
    { k: "perfis", label: `Perfis internos: ${(d.perfis ?? []).join(", ") || "—"}`, ok: (d.perfis ?? []).length > 0 },
    { k: "instrucoes", label: "Instruções de dar/retirar acesso", ok: !!(d.instrucoes_acesso || d.instrucoes_revogacao) },
  ].filter((x) => x.ok) as { k: ItemAplicavel; label: string; ok: boolean }[];
  const sel = marcados ?? disponiveis.map((x) => x.k);
  const jaAplicado = t.payload?.aplicado_em;

  const aplicar = async () => {
    setAplicando(true);
    const { app: patch, config, perfis } = diagnosticoParaFicha(d, sel, cfg);
    try {
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("aplicacoes").update({ ...patch, teste_status: "pendente" } as Row).eq("id", id);
        if (error) throw error;
      }
      if (config) {
        const { error } = await (supabase as Row).from("aplicacao_connectors").upsert({ aplicacao_id: id, config, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      if (perfis.length) {
        const { data: ex } = await supabase.from("aplicacao_perfis_internos").select("nome_externo").eq("aplicacao_id", id);
        const tem = new Set((ex ?? []).map((p: Row) => String(p.nome_externo).toLowerCase()));
        const novos = perfis.filter((p) => !tem.has(p.toLowerCase()));
        if (novos.length) {
          const { error } = await supabase.from("aplicacao_perfis_internos").insert(novos.map((n) => ({ aplicacao_id: id, nome_externo: n })) as Row);
          if (error) throw error;
        }
      }
      toast.success("Diagnóstico do Hermes aplicado na ficha");
      onApplied();
    } catch (e) {
      toast.error("Não foi possível aplicar", { description: e instanceof Error ? e.message : String(e) });
    } finally { setAplicando(false); }
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-medium">Diagnóstico do Hermes</p></div>
      <p className="break-all text-muted-foreground">Fonte: {fonte}</p>
      {d.motivo && <p>{d.motivo}</p>}
      {(d.segredos_removidos ?? 0) > 0 && (
        <p className="flex items-start gap-1 text-warning"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />Havia {d.segredos_removidos} credencial(is) no material; foram descartadas. Digite-as no campo protegido "Credencial".</p>
      )}
      {disponiveis.length > 0 ? (
        <div className="space-y-1">
          {disponiveis.map((x) => (
            <label key={x.k} className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={sel.includes(x.k)} onCheckedChange={(v) => setMarcados(v ? [...sel, x.k] : sel.filter((s) => s !== x.k))} className="mt-0.5" />
              <span className="break-all">{x.label}</span>
            </label>
          ))}
        </div>
      ) : <p className="text-muted-foreground">O Hermes não encontrou dados para preencher a ficha.</p>}
      {(d.lacunas ?? []).length > 0 && <div><p className="font-medium">O que faltou</p><ul className="list-disc pl-4 text-muted-foreground">{d.lacunas!.map((l) => <li key={l}>{l}</li>)}</ul></div>}
      {disponiveis.length > 0 && <Button size="sm" className="w-full" disabled={aplicando || !sel.length || !app || !!jaAplicado} onClick={aplicar}>{aplicando ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aplicar na ficha"}</Button>}
    </div>
  );
}
