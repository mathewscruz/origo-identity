import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const entidadeColors: Record<string, string> = {
  pessoa: "bg-info/15 text-info border-info/30",
  aplicacao: "bg-primary/15 text-primary border-primary/30",
  perfil: "bg-warning/15 text-warning border-warning/30",
  regra: "bg-muted text-muted-foreground",
  evento_jml: "bg-success/15 text-success border-success/30",
  excecao: "bg-destructive/15 text-destructive border-destructive/30",
  operador: "bg-muted text-muted-foreground",
};

const mockAuditoria = [
  { id: "1", timestamp: "17/03/2026 10:42:15", operador: "João IAM", acao: "Aprovar exceção", entidade: "excecao", entidadeId: "EXC-001", resumo: "Aprovação de acesso extra ao AWS Console para Pedro Costa", ip: "10.0.1.42" },
  { id: "2", timestamp: "17/03/2026 10:30:08", operador: "Sistema", acao: "Executar evento JML", entidade: "evento_jml", entidadeId: "EVT-002", resumo: "Mover executado: Carlos Souza cargo atualizado", ip: "—" },
  { id: "3", timestamp: "17/03/2026 09:15:00", operador: "Admin Principal", acao: "Importar base 2Easy", entidade: "pessoa", entidadeId: "IMP-142", resumo: "Importação #142: 1247 registros, 1 novo, 3 alterados, 2 quarentena", ip: "10.0.1.10" },
  { id: "4", timestamp: "16/03/2026 16:00:22", operador: "Maria Owner", acao: "Criar regra", entidade: "regra", entidadeId: "REG-005", resumo: "Nova regra: Terceiro Crítico → Aprovação Owner", ip: "10.0.2.55" },
  { id: "5", timestamp: "16/03/2026 14:30:11", operador: "Maria Owner", acao: "Aprovar evento JML", entidade: "evento_jml", entidadeId: "EVT-003", resumo: "Aprovação 1/2 para leaver Maria Oliveira", ip: "10.0.2.55" },
  { id: "6", timestamp: "16/03/2026 11:00:45", operador: "João IAM", acao: "Ativar regra", entidade: "regra", entidadeId: "REG-004", resumo: "Regra 'Financeiro → SAP + BI' ativada", ip: "10.0.1.42" },
  { id: "7", timestamp: "15/03/2026 09:30:00", operador: "Sistema", acao: "Retry evento JML", entidade: "evento_jml", entidadeId: "EVT-005", resumo: "Tentativa 2/3 para mover Lucia Ferreira — falha de integração", ip: "—" },
  { id: "8", timestamp: "15/03/2026 09:00:00", operador: "Sistema", acao: "Erro evento JML", entidade: "evento_jml", entidadeId: "EVT-010", resumo: "Erro permanente: Roberto Almeida status mover — max tentativas", ip: "—" },
];

export default function AuditoriaPage() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<typeof mockAuditoria[0] | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
          <p className="text-sm text-muted-foreground">Logs completos com evidências e relatórios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Download className="mr-1 h-4 w-4" />Exportar CSV</Button>
          <Button variant="outline"><Download className="mr-1 h-4 w-4" />Relatório PDF</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" />
        </div>
        <Select><SelectTrigger className="w-[160px]"><SelectValue placeholder="Operador" /></SelectTrigger><SelectContent>
          <SelectItem value="todos">Todos</SelectItem><SelectItem value="joao">João IAM</SelectItem>
          <SelectItem value="maria">Maria Owner</SelectItem><SelectItem value="sistema">Sistema</SelectItem>
        </SelectContent></Select>
        <Select><SelectTrigger className="w-[160px]"><SelectValue placeholder="Entidade" /></SelectTrigger><SelectContent>
          <SelectItem value="todas">Todas</SelectItem><SelectItem value="pessoa">Pessoa</SelectItem>
          <SelectItem value="evento_jml">Evento JML</SelectItem><SelectItem value="regra">Regra</SelectItem>
          <SelectItem value="excecao">Exceção</SelectItem>
        </SelectContent></Select>
        <Input type="date" className="w-[160px]" />
        <Input type="date" className="w-[160px]" />
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Timestamp</th><th className="p-4 font-medium">Operador</th>
          <th className="p-4 font-medium">Ação</th><th className="p-4 font-medium">Entidade</th>
          <th className="p-4 font-medium">ID</th><th className="p-4 font-medium">Resumo</th>
          <th className="p-4 font-medium">IP</th><th className="p-4 font-medium"></th>
        </tr></thead><tbody>
          {mockAuditoria.map((a) => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="p-4 text-xs text-muted-foreground font-mono">{a.timestamp}</td>
              <td className="p-4 text-muted-foreground">{a.operador}</td>
              <td className="p-4 font-medium">{a.acao}</td>
              <td className="p-4"><Badge variant="outline" className={entidadeColors[a.entidade]}>{a.entidade.replace(/_/g, " ")}</Badge></td>
              <td className="p-4 text-xs text-primary font-mono">{a.entidadeId}</td>
              <td className="p-4 text-muted-foreground text-xs max-w-[250px] truncate">{a.resumo}</td>
              <td className="p-4 text-xs text-muted-foreground font-mono">{a.ip}</td>
              <td className="p-4">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelected(a); setDetailOpen(true); }}>
                  <Eye className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhe da Auditoria</DialogTitle></DialogHeader>
          {selected && (
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-[400px]">
              {JSON.stringify({
                id: selected.id,
                timestamp: selected.timestamp,
                operador: selected.operador,
                acao: selected.acao,
                entidade: selected.entidade,
                entidade_id: selected.entidadeId,
                resumo: selected.resumo,
                ip: selected.ip,
                detalhes: { exemplo: "payload completo da operação seria exibido aqui" },
              }, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
