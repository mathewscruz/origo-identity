import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useParametros } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

export default function ParametrosPage() {
  const { data: parametros, isLoading } = useParametros();

  const getParam = (chave: string) => parametros?.find((p) => p.chave === chave)?.valor ?? "";

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas de Terceiros</CardTitle>
          <CardDescription>Dias de antecedência para alertas de vencimento de contrato</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Dias antes do vencimento</Label>
            <Input type="number" defaultValue={getParam("dias_alerta_contrato") || "30"} className="w-32" />
          </div>
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
            <Input type="number" defaultValue={getParam("max_tentativas_jml") || "3"} className="w-32" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Dupla aprovação para leavers</Label>
              <p className="text-xs text-muted-foreground">Exigir dupla aprovação para eventos de desligamento</p>
            </div>
            <Switch defaultChecked={getParam("aprovacao_dupla_leaver") === "true"} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Importação automática</Label>
              <p className="text-xs text-muted-foreground">Importação automática do 2Easy</p>
            </div>
            <Switch defaultChecked={getParam("importacao_automatica") === "true"} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Salvar Parâmetros</Button>
      </div>
    </div>
  );
}
