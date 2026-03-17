import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};
const statusColors: Record<string, string> = {
  detectado: "bg-warning/15 text-warning border-warning/30",
  calculado: "bg-info/15 text-info border-info/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  executado_parcial: "bg-warning/15 text-warning border-warning/30",
  aguardando_aprovacao: "bg-info/15 text-info border-info/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  erro_permanente: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground",
  quarentena: "bg-warning/15 text-warning border-warning/30",
};
const statusLabels: Record<string, string> = {
  detectado: "Detectado", calculado: "Calculado", executando: "Executando",
  executado: "Executado", executado_parcial: "Parcial", aguardando_aprovacao: "Aguard. Aprovação",
  erro: "Erro", erro_permanente: "Erro Permanente", cancelado: "Cancelado", quarentena: "Quarentena",
};
const severidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground", media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30", critica: "bg-destructive/15 text-destructive border-destructive/30",
};

const mockEventos = [
  { id: "1", tipo: "joiner", severidade: "baixa", pessoa: "Ana Silva", pessoaId: "1", mudanca: "Admissão — Analista RH", acoes: 2, status: "detectado", importacao: "#142", data: "17/03/2026" },
  { id: "2", tipo: "mover", severidade: "media", pessoa: "Carlos Souza", pessoaId: "2", mudanca: "Cargo: Dev Pleno → Dev Senior", acoes: 3, status: "executado", importacao: "#142", data: "17/03/2026" },
  { id: "3", tipo: "leaver", severidade: "alta", pessoa: "Maria Oliveira", pessoaId: "3", mudanca: "Desligamento detectado", acoes: 5, status: "aguardando_aprovacao", importacao: "#142", data: "16/03/2026" },
  { id: "4", tipo: "joiner", severidade: "baixa", pessoa: "Pedro Costa", pessoaId: "4", mudanca: "Admissão — Dev Backend", acoes: 4, status: "executado", importacao: "#142", data: "16/03/2026" },
  { id: "5", tipo: "mover", severidade: "media", pessoa: "Lucia Ferreira", pessoaId: "5", mudanca: "Área: Produto → Dados & BI", acoes: 2, status: "erro", importacao: "#141", data: "15/03/2026" },
  { id: "6", tipo: "leaver", severidade: "critica", pessoa: "Thiago Nunes", pessoaId: "14", mudanca: "Ausente na importação", acoes: 0, status: "quarentena", importacao: "#142", data: "17/03/2026" },
  { id: "7", tipo: "leaver", severidade: "alta", pessoa: "Marcos Vieira", pessoaId: "12", mudanca: "Ausente na importação", acoes: 0, status: "quarentena", importacao: "#142", data: "17/03/2026" },
  { id: "8", tipo: "mover", severidade: "baixa", pessoa: "Fernanda Lima", pessoaId: "7", mudanca: "Gestor: Ana → Roberto", acoes: 1, status: "executado", importacao: "#140", data: "10/03/2026" },
  { id: "9", tipo: "joiner", severidade: "baixa", pessoa: "Diego Santos", pessoaId: "8", mudanca: "Admissão — Estagiário TI", acoes: 1, status: "executado", importacao: "#139", data: "05/03/2026" },
  { id: "10", tipo: "mover", severidade: "alta", pessoa: "Roberto Almeida", pessoaId: "6", mudanca: "Status: Ativo → Afastado", acoes: 4, status: "erro_permanente", importacao: "#141", data: "15/03/2026" },
];

type TabKey = "pendentes" | "quarentena" | "executados" | "erros" | "todos";

const tabFilters: Record<TabKey, (e: typeof mockEventos[0]) => boolean> = {
  pendentes: (e) => ["detectado", "calculado", "executando", "aguardando_aprovacao"].includes(e.status),
  quarentena: (e) => e.status === "quarentena",
  executados: (e) => ["executado", "executado_parcial"].includes(e.status),
  erros: (e) => ["erro", "erro_permanente"].includes(e.status),
  todos: () => true,
};

export default function EventosJMLPage() {
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [busca, setBusca] = useState("");

  const quarentenaCount = mockEventos.filter(tabFilters.quarentena).length;
  const filtered = mockEventos
    .filter(tabFilters[tab])
    .filter((e) => !busca || e.pessoa.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos JML</h1>
        <p className="text-sm text-muted-foreground">Central de processamento e monitoramento do ciclo de vida</p>
      </div>

      {quarentenaCount > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">
              {quarentenaCount} evento(s) em quarentena aguardam validação manual
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pendentes">Pendentes ({mockEventos.filter(tabFilters.pendentes).length})</TabsTrigger>
            <TabsTrigger value="quarentena">Quarentena ({quarentenaCount})</TabsTrigger>
            <TabsTrigger value="executados">Executados ({mockEventos.filter(tabFilters.executados).length})</TabsTrigger>
            <TabsTrigger value="erros">Erros ({mockEventos.filter(tabFilters.erros).length})</TabsTrigger>
            <TabsTrigger value="todos">Todos ({mockEventos.length})</TabsTrigger>
          </TabsList>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar pessoa..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        {["pendentes", "quarentena", "executados", "erros", "todos"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-4 font-medium">Tipo</th>
                      <th className="p-4 font-medium">Severidade</th>
                      <th className="p-4 font-medium">Pessoa</th>
                      <th className="p-4 font-medium">Mudança</th>
                      <th className="p-4 font-medium">Ações</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Import.</th>
                      <th className="p-4 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ev) => (
                      <tr key={ev.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4"><Badge className={`${tipoColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo.charAt(0)}</Badge></td>
                        <td className="p-4"><Badge variant="outline" className={severidadeColors[ev.severidade]}>{ev.severidade}</Badge></td>
                        <td className="p-4"><Link to={`/eventos-jml/${ev.id}`} className="font-medium text-primary hover:underline">{ev.pessoa}</Link></td>
                        <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{ev.mudanca}</td>
                        <td className="p-4 text-muted-foreground">{ev.acoes}</td>
                        <td className="p-4"><Badge variant="outline" className={statusColors[ev.status]}>{statusLabels[ev.status]}</Badge></td>
                        <td className="p-4 text-muted-foreground text-xs">{ev.importacao}</td>
                        <td className="p-4 text-muted-foreground text-xs">{ev.data}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum evento encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
