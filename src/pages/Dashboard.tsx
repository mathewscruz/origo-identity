import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, ShieldCheck, KeyRound, RefreshCw, AppWindow } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores, useTerceiros, useAlertas, useColabQuarentena } from "@/hooks/useOrigoData";

function useAccessStatusData() {
  return useQuery({
    queryKey: ["dashboard_access_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfil_atribuicoes")
        .select("ativo, data_revogacao");
      if (error) throw error;
      const rows = data ?? [];
      const ativos = rows.filter(r => r.ativo && !r.data_revogacao).length;
      const revogados = rows.filter(r => !r.ativo || !!r.data_revogacao).length;
      return [
        { name: "Ativos", value: ativos, color: "hsl(142, 71%, 45%)" },
        { name: "Revogados", value: revogados, color: "hsl(0, 84%, 60%)" },
      ].filter(d => d.value > 0);
    },
    refetchInterval: 30000,
  });
}

function useIamQueueStats() {
  return useQuery({
    queryKey: ["dashboard_iam_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("iam_queue")
        .select("status");
      if (error) throw error;
      const rows = data ?? [];
      const pending = rows.filter(r => r.status === "pending").length;
      const completed = rows.filter(r => r.status === "completed").length;
      const failed = rows.filter(r => r.status === "failed" || r.status === "permanent_failure").length;
      return { pending, completed, failed, total: rows.length };
    },
    refetchInterval: 30000,
  });
}

function useWeeklyProvisioningData() {
  return useQuery({
    queryKey: ["dashboard_weekly_provisioning"],
    queryFn: async () => {
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      const { data, error } = await supabase
        .from("iam_queue")
        .select("action_type, created_at")
        .gte("created_at", eightWeeksAgo.toISOString());
      if (error) throw error;
      const rows = data ?? [];
      
      const weeks: Record<string, { assign: number; remove: number; other: number }> = {};
      for (let i = 0; i < 8; i++) {
        weeks[`S${i + 1}`] = { assign: 0, remove: 0, other: 0 };
      }
      
      const now = Date.now();
      rows.forEach(r => {
        const age = now - new Date(r.created_at).getTime();
        const weekIdx = Math.min(7, Math.floor(age / (7 * 24 * 60 * 60 * 1000)));
        const key = `S${8 - weekIdx}`;
        if (!weeks[key]) return;
        const at = r.action_type || "";
        if (at.startsWith("assign")) weeks[key].assign++;
        else if (at.startsWith("remove") || at.startsWith("disable")) weeks[key].remove++;
        else weeks[key].other++;
      });
      
      return Object.entries(weeks).map(([semana, v]) => ({
        semana,
        Concessão: v.assign,
        Revogação: v.remove,
        Outros: v.other,
      }));
    },
    refetchInterval: 60000,
  });
}

function useRecentIamQueue() {
  return useQuery({
    queryKey: ["dashboard_recent_queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("iam_queue")
        .select("id, action_type, target_identity, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });
}

const statusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  permanent_failure: "bg-destructive/15 text-destructive border-destructive/30",
  processing: "bg-info/15 text-info border-info/30",
};

const actionLabels: Record<string, string> = {
  assign_group: "Grupo",
  remove_group: "Grupo",
  assign_license: "Licença",
  remove_license: "Licença",
  assign_app: "App",
  remove_app: "App",
  disable_entra: "Desabilitar",
  enable_entra: "Habilitar",
  create: "Criar",
  update: "Atualizar",
  delete: "Excluir",
};

export default function Dashboard() {
  const { data: colaboradores } = useColaboradores();
  const { data: terceiros } = useTerceiros();
  const { data: alertas } = useAlertas();
  const { data: quarentena } = useColabQuarentena();
  const { data: accessStatus } = useAccessStatusData();
  const { data: queueStats } = useIamQueueStats();
  const { data: weeklyData } = useWeeklyProvisioningData();
  const { data: recentQueue } = useRecentIamQueue();

  const pessoasAtivas = (colaboradores ?? []).filter((c) => c.status === "ativo").length;
  const terceirosAtivos = (terceiros ?? []).filter((t) => t.ativo).length;
  const naoLidos = (alertas ?? []).filter((a) => !a.lido).length;
  const quarentenaPendente = (quarentena ?? []).length;

  const kpis = [
    { title: "Pessoas Ativas", value: pessoasAtivas.toString(), change: `${terceirosAtivos} terceiros ativos`, icon: Users, changeType: "positive" as const },
    { title: "Quarentena Pendente", value: quarentenaPendente.toString(), icon: AlertTriangle, changeType: quarentenaPendente > 0 ? "warning" as const : "positive" as const, change: "ausentes do CSV" },
    { title: "Fila de Provisionamento", value: (queueStats?.pending ?? 0).toString(), icon: RefreshCw, changeType: (queueStats?.failed ?? 0) > 0 ? "warning" as const : "positive" as const, change: `${queueStats?.failed ?? 0} com erro · ${queueStats?.completed ?? 0} concluídos` },
    { title: "Alertas Não Lidos", value: naoLidos.toString(), icon: AlertTriangle, changeType: naoLidos > 0 ? "warning" as const : "positive" as const, change: `${(alertas ?? []).length} total` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão operacional consolidada</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className={`text-xs ${kpi.changeType === "positive" ? "text-success" : kpi.changeType === "warning" ? "text-warning" : "text-muted-foreground"}`}>{kpi.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle className="text-base">Provisionamento — Últimas 8 Semanas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="semana" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="Concessão" stackId="a" fill="hsl(142, 71%, 45%)" />
                <Bar dataKey="Revogação" stackId="a" fill="hsl(0, 84%, 60%)" />
                <Bar dataKey="Outros" stackId="a" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Acessos por Status</CardTitle></CardHeader>
          <CardContent>
            {(accessStatus ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={accessStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                    {(accessStatus ?? []).map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-muted-foreground text-sm">
                Nenhuma atribuição de perfil encontrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimas Solicitações de Provisionamento</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Ação</th><th className="pb-2 font-medium">Identidade</th>
                <th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Data</th>
              </tr></thead>
              <tbody>
                {(recentQueue ?? []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {actionLabels[item.action_type] || item.action_type}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Link to={`/fila-provisionamento/${item.id}`} className="font-medium text-primary hover:underline">
                        {item.target_identity || "—"}
                      </Link>
                    </td>
                    <td className="py-3"><Badge variant="outline" className={statusColors[item.status] || ""}>{item.status}</Badge></td>
                    <td className="py-3 text-muted-foreground">{new Date(item.created_at).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
                {(recentQueue ?? []).length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma solicitação recente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
