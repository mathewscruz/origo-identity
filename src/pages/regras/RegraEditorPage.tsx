import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Play, Loader2, CheckCircle } from "lucide-react";
import { useRegra, useRegraCondicoes, useRegraResultados, usePerfisAcesso } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Condicao { id: string; campo: string; operador: string; valor: string; }
interface Resultado { id: string; tipo: string; perfil_id: string; }

const campoOptions = [
  { value: "cargo", label: "Cargo" }, { value: "area", label: "Área" },
  { value: "tipo_vinculo", label: "Tipo Vínculo" }, { value: "empresa", label: "Empresa" },
  { value: "localidade", label: "Localidade" }, { value: "status", label: "Status" },
  { value: "tipo_pessoa", label: "Tipo Pessoa" }, { value: "criticidade", label: "Criticidade" },
];
const operadorOptions = [
  { value: "igual", label: "Igual a" }, { value: "diferente", label: "Diferente de" },
  { value: "em_lista", label: "Em lista" }, { value: "nao_em_lista", label: "Não em lista" },
];
const tipoResultadoOptions = [
  { value: "conceder_perfil", label: "Conceder perfil" }, { value: "revogar_perfil", label: "Revogar perfil" },
  { value: "exigir_aprovacao", label: "Exigir aprovação" }, { value: "bloquear", label: "Bloquear" },
];

export default function RegraEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { data: regra, isLoading: loadingRegra } = useRegra(id);
  const { data: dbCondicoes } = useRegraCondicoes(id);
  const { data: dbResultados } = useRegraResultados(id);
  const { data: perfis } = usePerfisAcesso();
  const { toast } = useToast();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [status, setStatus] = useState("rascunho");
  const [condicoes, setCondicoes] = useState<Condicao[]>([{ id: "1", campo: "", operador: "", valor: "" }]);
  const [resultados, setResultados] = useState<Resultado[]>([{ id: "1", tipo: "", perfil_id: "" }]);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulacaoResult, setSimulacaoResult] = useState<any>(null);
  const [showExecuteConfirm, setShowExecuteConfirm] = useState(false);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (regra) {
      setNome(regra.nome || "");
      setDescricao(regra.descricao || "");
      setPrioridade(String(regra.prioridade ?? ""));
      setStatus(regra.status || "rascunho");
    }
  }, [regra]);

  useEffect(() => {
    if (dbCondicoes?.length) setCondicoes(dbCondicoes.map((c: any) => ({ id: c.id, campo: c.campo, operador: c.operador, valor: c.valor })));
  }, [dbCondicoes]);

  useEffect(() => {
    if (dbResultados?.length) setResultados(dbResultados.map((r: any) => ({ id: r.id, tipo: r.tipo, perfil_id: r.perfil_id || "" })));
  }, [dbResultados]);

  if (!isNew && loadingRegra) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const addCondicao = () => setCondicoes([...condicoes, { id: String(Date.now()), campo: "", operador: "", valor: "" }]);
  const removeCondicao = (cid: string) => { if (condicoes.length > 1) setCondicoes(condicoes.filter((c) => c.id !== cid)); };
  const updateCondicao = (cid: string, field: keyof Condicao, value: string) => setCondicoes(condicoes.map(c => c.id === cid ? { ...c, [field]: value } : c));
  const addResultado = () => setResultados([...resultados, { id: String(Date.now()), tipo: "", perfil_id: "" }]);
  const removeResultado = (rid: string) => { if (resultados.length > 1) setResultados(resultados.filter((r) => r.id !== rid)); };
  const updateResultado = (rid: string, field: keyof Resultado, value: string) => setResultados(resultados.map(r => r.id === rid ? { ...r, [field]: value } : r));

  const saveRegra = async (targetStatus: string) => {
    if (!nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const validCondicoes = condicoes.filter(c => c.campo && c.operador && c.valor);
    if (validCondicoes.length === 0) { toast({ title: "Pelo menos uma condição completa é necessária", variant: "destructive" }); return; }
    const validResultados = resultados.filter(r => r.tipo);
    if (validResultados.length === 0) { toast({ title: "Pelo menos um resultado é necessário", variant: "destructive" }); return; }

    setSaving(true);
    try {
      let regraId = id;

      const regraPayload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        prioridade: parseInt(prioridade) || 0,
        status: targetStatus as any,
      };

      if (isNew) {
        const { data, error } = await supabase.from("regras").insert(regraPayload).select("id").single();
        if (error) throw error;
        regraId = data.id;
      } else {
        const { error } = await supabase.from("regras").update(regraPayload).eq("id", id!);
        if (error) throw error;

        // Delete existing conditions and results to re-create
        await supabase.from("regra_condicoes").delete().eq("regra_id", id!);
        await supabase.from("regra_resultados").delete().eq("regra_id", id!);
      }

      // Insert conditions
      const condicoesPayload = validCondicoes.map((c, i) => ({
        regra_id: regraId!,
        campo: c.campo,
        operador: c.operador,
        valor: c.valor,
        ordem: i,
      }));
      const { error: condErr } = await supabase.from("regra_condicoes").insert(condicoesPayload);
      if (condErr) throw condErr;

      // Insert results
      const resultadosPayload = validResultados.map((r, i) => ({
        regra_id: regraId!,
        tipo: r.tipo,
        perfil_id: r.perfil_id || null,
        ordem: i,
      }));
      const { error: resErr } = await supabase.from("regra_resultados").insert(resultadosPayload);
      if (resErr) throw resErr;

      toast({ title: targetStatus === "ativa" ? "Regra ativada" : "Rascunho salvo" });

      if (isNew) {
        navigate(`/regras/${regraId}/editar`, { replace: true });
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleSimulate = async () => {
    if (!id) { toast({ title: "Salve a regra antes de simular", variant: "destructive" }); return; }
    setSimulating(true);
    setSimulacaoResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-rules`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regra_id: id, execute: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSimulacaoResult(data);
    } catch (err: any) {
      toast({ title: "Erro na simulação", description: err.message, variant: "destructive" });
    }
    setSimulating(false);
  };

  const handleExecute = async () => {
    if (!id) return;
    setExecuting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-rules`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regra_id: id, execute: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ title: "Regra executada", description: `${data.applied || 0} atribuições criadas.` });
      setSimulacaoResult(data);
    } catch (err: any) {
      toast({ title: "Erro na execução", description: err.message, variant: "destructive" });
    }
    setExecuting(false);
    setShowExecuteConfirm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/regras"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "Nova Regra" : "Editar Regra"}</h1>
          <p className="text-sm text-muted-foreground">{isNew ? "Configure condições e resultados" : `Editando: ${regra?.nome || ""}`}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/regras">Cancelar</Link></Button>
          <Button variant="outline" disabled={saving} onClick={() => saveRegra("rascunho")}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar Rascunho
          </Button>
          <Button disabled={saving} onClick={() => saveRegra("ativa")}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Ativar Regra
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome da regra</Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome descritivo" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Prioridade</Label><Input type="number" value={prioridade} onChange={e => setPrioridade(e.target.value)} placeholder="1-100" /></div>
              <div className="space-y-2"><Label>Status</Label>
                <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem><SelectItem value="inativa">Inativa</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem>
                </SelectContent></Select>
              </div>
            </div>
          </div>
          <div className="space-y-2"><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o objetivo" rows={2} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-base">Condições</CardTitle><CardDescription>Combinadas com AND</CardDescription></div>
          <Button variant="outline" size="sm" onClick={addCondicao}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {condicoes.map((cond, i) => (
            <div key={cond.id} className="flex items-center gap-3">
              {i > 0 ? <Badge variant="outline" className="shrink-0 bg-muted">AND</Badge> : <div className="w-[52px] shrink-0" />}
              <Select value={cond.campo || undefined} onValueChange={v => updateCondicao(cond.id, "campo", v)}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Campo" /></SelectTrigger><SelectContent>
                {campoOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              <Select value={cond.operador || undefined} onValueChange={v => updateCondicao(cond.id, "operador", v)}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Operador" /></SelectTrigger><SelectContent>
                {operadorOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              <Input value={cond.valor} onChange={e => updateCondicao(cond.id, "valor", e.target.value)} placeholder="Valor" className="flex-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondicao(cond.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-base">Resultados</CardTitle><CardDescription>Ações quando condições são atendidas</CardDescription></div>
          <Button variant="outline" size="sm" onClick={addResultado}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {resultados.map((res) => (
            <div key={res.id} className="flex items-center gap-3">
              <Select value={res.tipo || undefined} onValueChange={v => updateResultado(res.id, "tipo", v)}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Tipo" /></SelectTrigger><SelectContent>
                {tipoResultadoOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              {(res.tipo === "conceder_perfil" || res.tipo === "revogar_perfil") && (
                <Select value={res.perfil_id || undefined} onValueChange={v => updateResultado(res.id, "perfil_id", v)}><SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar perfil" /></SelectTrigger><SelectContent>
                  {perfis?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent></Select>
              )}
              {!res.tipo && <div className="flex-1" />}
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeResultado(res.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-base">Simulação de Impacto</CardTitle><CardDescription>Preview das ações que seriam executadas (sem alterar dados)</CardDescription></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSimulate} disabled={simulating || !id}>
              {simulating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}Simular
            </Button>
            {simulacaoResult && simulacaoResult.actions?.length > 0 && (
              <Button variant="default" onClick={() => setShowExecuteConfirm(true)} disabled={executing}>
                {executing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}Executar
              </Button>
            )}
          </div>
        </CardHeader>
        {simulacaoResult && (
          <CardContent>
            {simulacaoResult.actions?.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ação seria executada. Nenhum colaborador atende às condições ou já possui as atribuições.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">{simulacaoResult.actions?.length || 0} ação(ões) {simulacaoResult.executed ? "executadas" : "seriam executadas"}:</p>
                <div className="max-h-60 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground bg-muted/50">
                      <th className="p-2 font-medium">Colaborador</th><th className="p-2 font-medium">Ação</th><th className="p-2 font-medium">Perfil</th>
                    </tr></thead>
                    <tbody>
                      {(simulacaoResult.actions || []).map((a: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2">{a.colaborador_nome}</td>
                          <td className="p-2"><Badge variant="outline">{a.tipo}</Badge></td>
                          <td className="p-2">{a.perfil_nome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        )}
        {!simulacaoResult && !simulating && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{id ? "Clique em 'Simular' para ver o impacto desta regra." : "Salve a regra primeiro para poder simular."}</p>
          </CardContent>
        )}
      </Card>

      <AlertDialog open={showExecuteConfirm} onOpenChange={setShowExecuteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Executar regra manualmente?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso criará {simulacaoResult?.actions?.length || 0} atribuição(ões) de perfil no banco de dados. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecute}>Confirmar Execução</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
