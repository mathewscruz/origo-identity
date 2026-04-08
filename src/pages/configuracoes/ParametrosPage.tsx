import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useParametros } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, Save } from "lucide-react";
import { useCanEdit } from "@/hooks/useRole";

export default function ParametrosPage() {
  const { data: parametros, isLoading } = useParametros();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingModo, setPendingModo] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const canEdit = useCanEdit();

  // Form state for editable parameters
  const [maxTentativas, setMaxTentativas] = useState("3");
  const [aprovacaoDupla, setAprovacaoDupla] = useState(false);
  const [importacaoAuto, setImportacaoAuto] = useState(false);

  const getParam = (chave: string) => parametros?.find((p: any) => p.chave === chave)?.valor ?? "";
  const getParamId = (chave: string) => parametros?.find((p: any) => p.chave === chave)?.id;
  const modoAtual = getParam("modo_operacao") || "simulacao";
  const isProducao = modoAtual === "producao";

  // Sync form state when parametros load
  useEffect(() => {
    if (parametros) {
      setMaxTentativas(getParam("max_tentativas_jml") || "3");
      setAprovacaoDupla(getParam("aprovacao_dupla_leaver") === "true");
      setImportacaoAuto(getParam("importacao_automatica") === "true");
    }
  }, [parametros]);

  const handleModoToggle = () => {
    const novoModo = isProducao ? "simulacao" : "producao";
    setPendingModo(novoModo);
    setConfirmOpen(true);
  };

  const confirmModoChange = async () => {
    if (!pendingModo) return;
    setSwitching(true);
    const paramId = getParamId("modo_operacao");
    if (paramId) {
      await supabase.from("parametros").update({ valor: pendingModo }).eq("id", paramId);
    } else {
      await supabase.from("parametros").insert({ chave: "modo_operacao", valor: pendingModo, descricao: "Modo de operação" });
    }
    await supabase.from("auditoria").insert({
      entidade: "parametros", acao: "alterar_modo",
      resumo: `Modo alterado de ${modoAtual} para ${pendingModo}`,
      detalhes: { anterior: modoAtual, novo: pendingModo },
    });
    toast({ title: `Modo alterado para ${pendingModo === "producao" ? "Produção" : "Simulação"}` });
    qc.invalidateQueries({ queryKey: ["parametros"] });
    qc.invalidateQueries({ queryKey: ["modo_operacao"] });
    setSwitching(false);
    setConfirmOpen(false);
    setPendingModo(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = [
        { chave: "max_tentativas_jml", valor: maxTentativas, descricao: "Máximo de tentativas JML" },
        { chave: "aprovacao_dupla_leaver", valor: String(aprovacaoDupla), descricao: "Dupla aprovação para leavers" },
        { chave: "importacao_automatica", valor: String(importacaoAuto), descricao: "Importação automática" },
      ];

      for (const item of upserts) {
        const paramId = getParamId(item.chave);
        if (paramId) {
          await supabase.from("parametros").update({ valor: item.valor }).eq("id", paramId);
        } else {
          await supabase.from("parametros").insert(item);
        }
      }

      await supabase.from("auditoria").insert({
        entidade: "parametros", acao: "salvar_parametros",
        resumo: "Parâmetros JML atualizados",
        detalhes: { max_tentativas_jml: maxTentativas, aprovacao_dupla_leaver: aprovacaoDupla, importacao_automatica: importacaoAuto },
      });

      toast({ title: "Parâmetros salvos com sucesso" });
      qc.invalidateQueries({ queryKey: ["parametros"] });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className={isProducao ? "border-success/30" : "border-warning/30"}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isProducao ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldAlert className="h-5 w-5 text-warning" />}
              <div>
                <CardTitle className="text-base">Modo de Operação</CardTitle>
                <CardDescription>Controla se as ações são executadas de fato no AD/Entra ID</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={isProducao ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>
                {isProducao ? "Produção" : "Simulação"}
              </Badge>
              {canEdit && (
                <Button
                  variant={isProducao ? "outline" : "default"}
                  size="sm"
                  onClick={handleModoToggle}
                  disabled={switching}
                >
                  {isProducao ? "Voltar para Simulação" : "Ativar Produção"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {isProducao
              ? "As solicitações da fila de provisionamento serão processadas pelo agente AD em tempo real."
              : "As solicitações ficam na fila mas não são entregues ao agente AD para execução."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Processamento JML</CardTitle>
          <CardDescription>Configurações do motor de eventos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Máximo de tentativas (retry)</Label>
            <Input
              type="number"
              value={maxTentativas}
              onChange={(e) => setMaxTentativas(e.target.value)}
              className="w-32"
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Dupla aprovação para leavers</Label>
              <p className="text-xs text-muted-foreground">Exigir dupla aprovação para eventos de desligamento</p>
            </div>
            <Switch
              checked={aprovacaoDupla}
              onCheckedChange={setAprovacaoDupla}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Importação automática</Label>
              <p className="text-xs text-muted-foreground">Importação automática do 2Easy</p>
            </div>
            <Switch
              checked={importacaoAuto}
              onCheckedChange={setImportacaoAuto}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Parâmetros"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingModo === "producao" ? "Ativar modo Produção?" : "Voltar para Simulação?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingModo === "producao"
                ? "No modo Produção, todas as solicitações da fila serão processadas pelo agente e executadas no Active Directory e Entra ID. Confirme que deseja prosseguir."
                : "No modo Simulação, as solicitações continuarão sendo registradas mas não serão entregues ao agente para execução."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModoChange} disabled={switching}>
              {pendingModo === "producao" ? "Sim, ativar Produção" : "Sim, voltar para Simulação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
