import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, GitPullRequest, Upload } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Link } from "react-router-dom";

const kpis = [
  {
    title: "Pessoas Ativas",
    value: "1.247",
    change: "+12 este mês",
    icon: Users,
    changeType: "positive" as const,
  },
  {
    title: "Terceiros Vencendo 30d",
    value: "8",
    change: "3 em 7 dias",
    icon: UserCheck,
    changeType: "warning" as const,
  },
  {
    title: "Eventos JML Pendentes",
    value: "23",
    change: "5J · 12M · 6L",
    icon: GitPullRequest,
    changeType: "neutral" as const,
  },
  {
    title: "Última Importação",
    value: "14/03",
    change: "Concluída",
    icon: Upload,
    changeType: "positive" as const,
  },
];

const jmlWeeklyData = [
  { semana: "S1", Joiner: 4, Mover: 8, Leaver: 2 },
  { semana: "S2", Joiner: 6, Mover: 5, Leaver: 3 },
  { semana: "S3", Joiner: 3, Mover: 12, Leaver: 1 },
  { semana: "S4", Joiner: 8, Mover: 6, Leaver: 4 },
  { semana: "S5", Joiner: 2, Mover: 9, Leaver: 5 },
  { semana: "S6", Joiner: 5, Mover: 7, Leaver: 2 },
  { semana: "S7", Joiner: 7, Mover: 4, Leaver: 6 },
  { semana: "S8", Joiner: 3, Mover: 10, Leaver: 3 },
];

const accessStatusData = [
  { name: "Ativos", value: 842, color: "hsl(142, 71%, 45%)" },
  { name: "Pendentes", value: 56, color: "hsl(38, 92%, 50%)" },
  { name: "Revogados", value: 124, color: "hsl(0, 84%, 60%)" },
  { name: "Expirados", value: 38, color: "hsl(215, 16%, 47%)" },
];

const recentEvents = [
  { id: "1", tipo: "joiner", pessoa: "Ana Silva", cargo: "Analista RH", status: "detectado", data: "17/03/2026" },
  { id: "2", tipo: "mover", pessoa: "Carlos Souza", cargo: "Gerente TI", status: "executado", data: "17/03/2026" },
  { id: "3", tipo: "leaver", pessoa: "Maria Oliveira", cargo: "Coord. Financeiro", status: "aguardando_aprovacao", data: "16/03/2026" },
  { id: "4", tipo: "joiner", pessoa: "Pedro Costa", cargo: "Dev Backend", status: "executado", data: "16/03/2026" },
  { id: "5", tipo: "mover", pessoa: "Lucia Ferreira", cargo: "Analista Dados", status: "erro", data: "15/03/2026" },
];

const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};

const statusColors: Record<string, string> = {
  detectado: "bg-warning/15 text-warning border-warning/30",
  executado: "bg-success/15 text-success border-success/30",
  aguardando_aprovacao: "bg-info/15 text-info border-info/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
};

const statusLabels: Record<string, string> = {
  detectado: "Detectado",
  executado: "Executado",
  aguardando_aprovacao: "Aguard. Aprovação",
  erro: "Erro",
};

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão operacional consolidada</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className={`text-xs ${
                kpi.changeType === "positive" ? "text-success" :
                kpi.changeType === "warning" ? "text-warning" :
                "text-muted-foreground"
              }`}>
                {kpi.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Eventos JML — Últimas 8 Semanas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={jmlWeeklyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="semana" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="Joiner" stackId="a" fill="hsl(142, 71%, 45%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Mover" stackId="a" fill="hsl(199, 89%, 48%)" />
                <Bar dataKey="Leaver" stackId="a" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Acessos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={accessStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {accessStatusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos Eventos JML</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="pb-2 font-medium">Pessoa</th>
                  <th className="pb-2 font-medium">Cargo</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((event) => (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="py-3">
                      <Badge className={`${tipoColors[event.tipo]} text-[10px] uppercase`}>
                        {event.tipo.charAt(0)}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Link to={`/eventos-jml/${event.id}`} className="font-medium text-primary hover:underline">
                        {event.pessoa}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">{event.cargo}</td>
                    <td className="py-3">
                      <Badge variant="outline" className={statusColors[event.status]}>
                        {statusLabels[event.status]}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{event.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
