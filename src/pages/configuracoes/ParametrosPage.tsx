import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSpreadsheet, Save, ShieldCheck, AtSign, ChevronDown, AlertTriangle, History, Undo2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useParametros } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type FieldType = "switch" | "number" | "text" | "select";
interface Field { key: string; label: string; help: string; type: FieldType; options?: { value: string; label: string }[]; min?: number; max?: number; suffix?: string; wide?: boolean }
interface Group { title: string; description: string; icon: typeof ShieldCheck; fields: Field[] }

const GROUPS: Group[] = [
  {
    title: "Aprovação e execução", description: "Quem aprova e como o Hermes recebe as ações.", icon: ShieldCheck,
    fields: [
      { key: "iam_approval_required", label: "Aprovação obrigatória", help: "Toda ação (criação, alteração, remoção, grupos, licenças, apps, reset de senha) aguarda aprovação de um administrador antes de ir para o agente.", type: "switch" },
      { key: "iam_enable_requires_approval", label: "Reabilitação exige aprovação", help: "Retorno de férias/afastamento, reversão de pré-leaver e recontratação sempre passam por aprovação, mesmo com a aprovação obrigatória desligada.", type: "switch" },
      { key: "mover_remocao_modo", label: "Mover: acessos exclusivos do cargo anterior", help: "O que fazer com recursos que só o cargo antigo concedia (acesso efetivo já considera outros perfis).", type: "select", options: [{ value: "aprovacao", label: "Remover após aprovação (recomendado)" }, { value: "imediato", label: "Remover imediatamente" }, { value: "nenhum", label: "Não remover (acúmulo)" }] },
    ],
  },
  {
    title: "Base do RH", description: "De onde vem a lista de colaboradores. Os limites evitam desligamentos em massa por arquivo incompleto.", icon: FileSpreadsheet,
    fields: [
      { key: "sharepoint_rh_site", label: "Site SharePoint", help: "Endereço do site, ex.: empresa.sharepoint.com:/sites/RH", type: "text", wide: true },
      { key: "sharepoint_rh_pasta", label: "Pasta", help: "Dentro de Documentos.", type: "text" },
      { key: "sharepoint_rh_prefixo", label: "Prefixo do arquivo", help: "O arquivo mais recente com esse prefixo é importado.", type: "text" },
      { key: "csv_leaver_limite_pct", label: "Limite de desligamentos (%)", help: "Percentual de ativos ausentes no arquivo a partir do qual nada é desligado (base ≥ 20 ativos).", type: "number", min: 0, max: 100, suffix: "%" },
      { key: "csv_leaver_limite_abs", label: "Limite de desligamentos (absoluto)", help: "Número máximo de desligamentos por arquivo.", type: "number", min: 0 },
    ],
  },
  {
    title: "Identidade e e-mail", description: "Como os e-mails e as contas das pessoas são gerados.", icon: AtSign,
    fields: [
      { key: "csv_gerar_email_corporativo", label: "Gerar e-mail corporativo", help: "Quando o RH não informa e-mail do domínio, gera nome.sobrenome@domínio na criação (nunca regenera).", type: "switch" },
      { key: "csv_email_dominio", label: "Domínio do e-mail corporativo", help: "Usado para colaboradores.", type: "text" },
      { key: "terceiro_email_dominio", label: "Domínio do e-mail de terceiros", help: "Usado no cadastro de terceiros.", type: "text" },
      { key: "ad_upn_dominio", label: "Domínio de login da rede", help: "Domínio do login das contas criadas na rede (AD).", type: "text" },
    ],
  },
  {
    title: "Governança periódica", description: "Revisões, revalidação de terceiros, detecção de órfãos e limiares de alerta.", icon: CalendarClock,
    fields: [
      { key: "revisao_periodicidade_dias", label: "Revisões por aplicação", help: "Dias entre campanhas automáticas por aplicação (o dono decide quem mantém ou perde; o Hermes executa).", type: "number", min: 7, suffix: "dias" },
      { key: "revisao_gestor_periodicidade_dias", label: "Revisões por gestor", help: "Dias entre campanhas em que cada gestor revisa os acessos da própria equipe. 0 desliga.", type: "number", min: 0, suffix: "dias" },
      { key: "terceiro_revalidacao_dias", label: "Revalidação de terceiros a cada", help: "Periodicidade: o responsável recebe por e-mail um link para manter ou desligar cada terceiro.", type: "number", min: 7, suffix: "dias" },
      { key: "terceiro_revalidacao_prazo_dias", label: "Prazo para revalidar terceiros", help: "Dias que o responsável tem para responder. Sem resposta até o prazo, os terceiros da campanha são desativados automaticamente (contas e acessos removidos pelo agente).", type: "number", min: 1, suffix: "dias" },
      { key: "licenca_critico_pct", label: "Licença crítica a partir de", help: "Percentual de uso que marca a licença como crítica.", type: "number", min: 1, max: 100, suffix: "%" },
      { key: "priv_role_max_membros", label: "Máx. pessoas por função privilegiada", help: "Acima disso o sistema gera um alerta crítico.", type: "number", min: 1 },
      { key: "iam_orphan_ignore_prefixes", label: "Prefixos ignorados (órfãos)", help: "Contas que começam com esses textos (separados por vírgula) não entram na revisão de contas órfãs.", type: "text", wide: true },
    ],
  },
];


export default function ParametrosPage() {
  const { data: parametros, isLoading } = useParametros();
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin" || role === "platform_admin";
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const stored = useMemo(() => Object.fromEntries(((parametros ?? []) as Row[]).map((p) => [p.chave, String(p.valor ?? "")])), [parametros]);
  useEffect(() => { setValues(stored); }, [stored]);
  const dirty = useMemo(() => Object.keys(values).filter((k) => values[k] !== stored[k]), [values, stored]);


  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!dirty.length) return;
    setSaving(true);
    try {
      for (const key of dirty) {
        const row = ((parametros ?? []) as Row[]).find((p) => p.chave === key);
        const valor = values[key];
        const { error } = row
          ? await supabase.from("parametros").update({ valor }).eq("id", row.id)
          : await supabase.from("parametros").insert({ chave: key, valor, descricao: GROUPS.flatMap((g) => g.fields).find((f) => f.key === key)?.help || key });
        if (error) throw error;
      }
      await supabase.from("auditoria").insert({
        entidade: "parametros", acao: "salvar_parametros", operador: profile?.email || "sistema",
        resumo: `Parâmetros alterados: ${dirty.join(", ")}`,
        detalhes: Object.fromEntries(dirty.map((k) => [k, { de: stored[k] ?? null, para: values[k] }])),
      });
      toast({ title: "Parâmetros salvos", description: `${dirty.length} alteração(ões) aplicada(s) — valem imediatamente para agente, importação e agenda.` });
      qc.invalidateQueries({ queryKey: ["parametros"] });
    } catch (err: Row) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {!isAdmin && <p className="text-xs text-muted-foreground">Somente administradores alteram parâmetros.</p>}
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><g.icon className="h-4 w-4" /></div>
              <div><CardTitle className="text-base">{g.title}</CardTitle><CardDescription>{g.description}</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {g.fields.map((f) => {
              const v = values[f.key] ?? "";
              const changed = dirty.includes(f.key);
              return (
                <div key={f.key} className={`space-y-1.5 rounded-md border p-3 ${changed ? "border-primary/40 bg-primary/5" : "border-transparent"} ${f.wide ? "md:col-span-2" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={f.key} className="text-sm">{f.label}</Label>
                    {f.type === "switch" ? (
                      <Switch id={f.key} checked={v === "true"} disabled={!isAdmin} onCheckedChange={(c) => set(f.key, c ? "true" : "false")} />
                    ) : f.type === "select" ? (
                      <Select value={v} onValueChange={(x) => set(f.key, x)} disabled={!isAdmin}>
                        <SelectTrigger className="h-8 w-[260px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{f.options!.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : f.type === "number" ? (
                      <div className="flex items-center gap-1"><Input id={f.key} type="number" min={f.min} max={f.max} className="h-8 w-24 text-right" value={v} disabled={!isAdmin} onChange={(e) => set(f.key, e.target.value)} />{f.suffix && <span className="text-xs text-muted-foreground">{f.suffix}</span>}</div>
                    ) : (
                      <Input id={f.key} className={`h-8 ${f.wide ? "w-full max-w-xl" : "w-56"}`} value={v} disabled={!isAdmin} onChange={(e) => set(f.key, e.target.value)} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {isAdmin && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving || dirty.length === 0} className="shadow-lg">
            <Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : dirty.length ? `Salvar ${dirty.length} alteração(ões)` : "Nada a salvar"}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><SlidersHorizontal className="h-3 w-3" />Última sincronização de roles privilegiadas: {stored.entra_roles_last_sync ? new Date(stored.entra_roles_last_sync).toLocaleString("pt-BR") : "nunca"}</div>
    </div>
  );
}
