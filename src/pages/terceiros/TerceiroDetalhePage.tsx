import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTerceiro } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function contractProgress(inicio: string | null, fim: string | null): number {
  if (!inicio || !fim) return 0;
  const start = new Date(inicio).getTime();
  const end = new Date(fim).getTime();
  const now = Date.now();
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

function diasRestantes(dataFim: string | null): number {
  if (!dataFim) return 999;
  return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function TerceiroDetalhePage() {
  const { id } = useParams();
  const { data: terceiro, isLoading } = useTerceiro(id);
  const [renovarOpen, setRenovarOpen] = useState(false);

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!terceiro) return <div className="p-8 text-center text-muted-foreground">Terceiro não encontrado.</div>;

  const progress = contractProgress(terceiro.contrato_inicio, terceiro.contrato_fim);
  const dias = diasRestantes(terceiro.contrato_fim);
  const crit = criticidadeConfig[terceiro.criticidade] || { label: terceiro.criticidade, class: "" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/terceiros"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{terceiro.nome}</h1>
            <Badge variant="outline" className={crit.class}>Criticidade {crit.label}</Badge>
            <Badge variant={terceiro.ativo ? "default" : "secondary"}>{terceiro.ativo ? "Ativo" : "Inativo"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{terceiro.empresa_terceira} · Responsável: {terceiro.responsavel || "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Pencil className="mr-1 h-3 w-3" /> Editar</Button>
          <Button size="sm" onClick={() => setRenovarOpen(true)}><RefreshCw className="mr-1 h-3 w-3" /> Renovar Contrato</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Início: {terceiro.contrato_inicio ? new Date(terceiro.contrato_inicio).toLocaleDateString("pt-BR") : "—"}
            </span>
            <span className={`text-xs font-medium ${dias <= 7 ? "text-destructive" : dias <= 30 ? "text-warning" : "text-muted-foreground"}`}>
              {dias > 0 ? `${dias} dias restantes` : dias === 999 ? "—" : `Vencido há ${Math.abs(dias)} dias`}
            </span>
            <span className="text-xs text-muted-foreground">
              Fim: {terceiro.contrato_fim ? new Date(terceiro.contrato_fim).toLocaleDateString("pt-BR") : "—"}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="contrato">Dados Contrato</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome", terceiro.nome],
                  ["Email", terceiro.email || "—"],
                  ["Empresa terceira", terceiro.empresa_terceira || "—"],
                  ["Responsável", terceiro.responsavel || "—"],
                  ["Criticidade", crit.label],
                ].map(([label, value]) => (
                  <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contrato" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Início contrato", terceiro.contrato_inicio ? new Date(terceiro.contrato_inicio).toLocaleDateString("pt-BR") : "—"],
                  ["Fim contrato", terceiro.contrato_fim ? new Date(terceiro.contrato_fim).toLocaleDateString("pt-BR") : "—"],
                  ["Status", terceiro.ativo ? "Ativo" : "Inativo"],
                  ["Criticidade", crit.label],
                ].map(([label, value]) => (
                  <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={renovarOpen} onOpenChange={setRenovarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar Contrato</DialogTitle>
            <DialogDescription>Renovar contrato de {terceiro.nome} ({terceiro.empresa_terceira})</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nova data de fim</Label><Input type="date" /></div>
            <div className="space-y-2"><Label>Justificativa</Label><Textarea placeholder="Motivo da renovação..." rows={3} /></div>
            <div className="flex items-center justify-between">
              <div><Label>Manter acessos atuais</Label><p className="text-xs text-muted-foreground">Os acessos ativos serão mantidos</p></div>
              <Switch defaultChecked />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenovarOpen(false)}>Cancelar</Button>
            <Button onClick={() => setRenovarOpen(false)}>Confirmar Renovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
