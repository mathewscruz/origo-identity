import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function ParametrosPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas de Terceiros</CardTitle>
          <CardDescription>Dias de antecedência para alertas de vencimento de contrato</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Alerta 1 (dias)</Label>
              <Input type="number" defaultValue={30} />
            </div>
            <div className="space-y-2">
              <Label>Alerta 2 (dias)</Label>
              <Input type="number" defaultValue={15} />
            </div>
            <div className="space-y-2">
              <Label>Alerta 3 (dias)</Label>
              <Input type="number" defaultValue={7} />
            </div>
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
            <Input type="number" defaultValue={3} className="w-32" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Modo quarentena para ausências</Label>
              <p className="text-xs text-muted-foreground">
                Registros ausentes na importação entram em quarentena antes de serem tratados como leaver
              </p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditoria</CardTitle>
          <CardDescription>Retenção de logs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Dias de retenção</Label>
            <Input type="number" defaultValue={365} className="w-32" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>Salvar Parâmetros</Button>
      </div>
    </div>
  );
}
