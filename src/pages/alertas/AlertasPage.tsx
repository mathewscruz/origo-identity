import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

const tipoColors: Record<string, string> = {
  vencimento_terceiro: "bg-warning/15 text-warning border-warning/30",
  evento_jml_erro: "bg-destructive/15 text-destructive border-destructive/30",
  licenca_critica: "bg-destructive/15 text-destructive border-destructive/30",
  aprovacao_pendente: "bg-info/15 text-info border-info/30",
  importacao: "bg-success/15 text-success border-success/30",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};
const severidadeColors: Record<string, string> = {
  info: "bg-info/15 text-info border-info/30",
  aviso: "bg-warning/15 text-warning border-warning/30",
  critico: "bg-destructive/15 text-destructive border-destructive/30",
};

const mockAlertas = [
  { id: "1", tipo: "vencimento_terceiro", severidade: "critico", titulo: "Contrato vencendo em 3 dias", mensagem: "Marcos Vieira (SecureIT) — contrato vence em 20/03/2026", refTipo: "terceiro", refId: "12", refUrl: "/terceiros/12", lido: false, data: "17/03/2026 08:00" },
  { id: "2", tipo: "evento_jml_erro", severidade: "critico", titulo: "Erro permanente em evento JML", mensagem: "Roberto Almeida — evento mover atingiu max tentativas", refTipo: "evento", refId: "10", refUrl: "/eventos-jml/10", lido: false, data: "15/03/2026 09:30" },
  { id: "3", tipo: "quarentena", severidade: "aviso", titulo: "2 registros em quarentena", mensagem: "Importação #142 — 2 pessoas ausentes aguardam validação", refTipo: "eventos", refId: "", refUrl: "/eventos-jml", lido: false, data: "17/03/2026 10:00" },
  { id: "4", tipo: "licenca_critica", severidade: "aviso", titulo: "Licença Datadog Pro com disponibilidade crítica", mensagem: "2 de 50 disponíveis (96% em uso)", refTipo: "licenca", refId: "6", refUrl: "/licencas/6", lido: true, data: "16/03/2026 12:00" },
  { id: "5", tipo: "aprovacao_pendente", severidade: "info", titulo: "Aprovação pendente", mensagem: "Exceção de acesso para Pedro Costa aguarda sua decisão", refTipo: "excecao", refId: "1", refUrl: "/excecoes", lido: true, data: "16/03/2026 10:00" },
  { id: "6", tipo: "importacao", severidade: "info", titulo: "Importação #142 concluída", mensagem: "1247 registros processados: 1 novo, 3 alterados, 2 quarentena", refTipo: "importacao", refId: "", refUrl: "/colaboradores", lido: true, data: "17/03/2026 09:15" },
  { id: "7", tipo: "vencimento_terceiro", severidade: "aviso", titulo: "Contrato vencendo em 7 dias", mensagem: "Ricardo Mendes (TechConsult) — contrato vence em 24/03/2026", refTipo: "terceiro", refId: "10", refUrl: "/terceiros/10", lido: true, data: "17/03/2026 08:00" },
];

export default function AlertasPage() {
  const [alertas, setAlertas] = useState(mockAlertas);
  const naoLidos = alertas.filter((a) => !a.lido);
  const [tab, setTab] = useState<"nao_lidos" | "todos">("nao_lidos");

  const filtered = tab === "nao_lidos" ? naoLidos : alertas;

  const marcarLido = (id: string) => setAlertas(alertas.map((a) => a.id === id ? { ...a, lido: true } : a));
  const marcarTodosLidos = () => setAlertas(alertas.map((a) => ({ ...a, lido: true })));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">Central de notificações operacionais</p>
        </div>
        {naoLidos.length > 0 && (
          <Button variant="outline" onClick={marcarTodosLidos}>
            <CheckCheck className="mr-1 h-4 w-4" />Marcar todos como lidos
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "nao_lidos" | "todos")}>
        <TabsList>
          <TabsTrigger value="nao_lidos">Não lidos ({naoLidos.length})</TabsTrigger>
          <TabsTrigger value="todos">Todos ({alertas.length})</TabsTrigger>
        </TabsList>
        {["nao_lidos", "todos"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Severidade</th><th className="p-4 font-medium">Título</th>
                <th className="p-4 font-medium">Mensagem</th><th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Ações</th>
              </tr></thead><tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className={`border-b last:border-0 ${!a.lido ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                    <td className="p-4"><Badge variant="outline" className={severidadeColors[a.severidade]}>{a.severidade}</Badge></td>
                    <td className="p-4 font-medium">{!a.lido && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />}{a.titulo}</td>
                    <td className="p-4 text-muted-foreground text-xs max-w-[300px] truncate">{a.mensagem}</td>
                    <td className="p-4 text-xs text-muted-foreground">{a.data}</td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {!a.lido && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarLido(a.id)}>Marcar lido</Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link to={a.refUrl}><ExternalLink className="h-3 w-3" /></Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum alerta.</td></tr>}
              </tbody></table>
            </CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
