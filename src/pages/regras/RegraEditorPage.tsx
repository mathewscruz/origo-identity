import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Play } from "lucide-react";
import { useRegra, useRegraCondicoes, useRegraResultados, usePerfisAcesso } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

interface Condicao { id: string; campo: string; operador: string; valor: string; }
interface Resultado { id: string; tipo: string; perfil?: string; }

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
  const isNew = !id;
  const { data: regra, isLoading: loadingRegra } = useRegra(id);
  const { data: dbCondicoes } = useRegraCondicoes(id);
  const { data: dbResultados } = useRegraResultados(id);
  const { data: perfis } = usePerfisAcesso();

  const [condicoes, setCondicoes] = useState<Condicao[]>([{ id: "1", campo: "", operador: "", valor: "" }]);
  const [resultados, setResultados] = useState<Resultado[]>([{ id: "1", tipo: "" }]);
  const [showSimulacao, setShowSimulacao] = useState(false);

  useEffect(() => {
    if (dbCondicoes?.length) setCondicoes(dbCondicoes.map((c) => ({ id: c.id, campo: c.campo, operador: c.operador, valor: c.valor })));
  }, [dbCondicoes]);

  useEffect(() => {
    if (dbResultados?.length) setResultados(dbResultados.map((r) => ({ id: r.id, tipo: r.tipo, perfil: (r.perfis_acesso as any)?.nome })));
  }, [dbResultados]);

  if (!isNew && loadingRegra) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const addCondicao = () => setCondicoes([...condicoes, { id: String(Date.now()), campo: "", operador: "", valor: "" }]);
  const removeCondicao = (cid: string) => { if (condicoes.length > 1) setCondicoes(condicoes.filter((c) => c.id !== cid)); };
  const addResultado = () => setResultados([...resultados, { id: String(Date.now()), tipo: "" }]);
  const removeResultado = (rid: string) => { if (resultados.length > 1) setResultados(resultados.filter((r) => r.id !== rid)); };

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
          <Button variant="outline">Salvar Rascunho</Button>
          <Button>Ativar Regra</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome da regra</Label><Input defaultValue={regra?.nome || ""} placeholder="Nome descritivo" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Prioridade</Label><Input type="number" defaultValue={regra?.prioridade ?? ""} placeholder="1-100" /></div>
              <div className="space-y-2"><Label>Status</Label><Select defaultValue={regra?.status || undefined}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem><SelectItem value="inativa">Inativa</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem>
              </SelectContent></Select></div>
            </div>
          </div>
          <div className="space-y-2"><Label>Descrição</Label><Textarea defaultValue={regra?.descricao || ""} placeholder="Descreva o objetivo" rows={2} /></div>
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
              <Select defaultValue={cond.campo}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Campo" /></SelectTrigger><SelectContent>
                {campoOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              <Select defaultValue={cond.operador}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Operador" /></SelectTrigger><SelectContent>
                {operadorOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              <Input defaultValue={cond.valor} placeholder="Valor" className="flex-1" />
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
              <Select defaultValue={res.tipo}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Tipo" /></SelectTrigger><SelectContent>
                {tipoResultadoOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent></Select>
              {(res.tipo === "conceder_perfil" || res.tipo === "revogar_perfil") && (
                <Select defaultValue={res.perfil}><SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar perfil" /></SelectTrigger><SelectContent>
                  {perfis?.map((p) => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}
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
          <div><CardTitle className="text-base">Simulação de Impacto</CardTitle><CardDescription>Preview das ações que seriam executadas</CardDescription></div>
          <Button variant="outline" onClick={() => setShowSimulacao(!showSimulacao)}><Play className="mr-1 h-3 w-3" />Simular</Button>
        </CardHeader>
        {showSimulacao && (
          <CardContent>
            <p className="text-sm text-muted-foreground">Simulação requer implementação do motor de regras no backend.</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
