import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, UserPlus, ArrowRightLeft, UserMinus, Shield, ShieldOff, Cloud, AlertTriangle, ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface Props {
  colaboradorId: string;
  colaboradorNome: string;
}

interface EventoJML {
  id: string;
  tipo: "joiner" | "mover" | "leaver";
  status: string;
  created_at: string;
  dados_antes: any;
  dados_depois: any;
}

interface Atribuicao {
  id: string;
  ativo: boolean;
  data_concessao: string;
  data_revogacao: string | null;
  perfis_acesso: { nome: string } | null;
}

interface QueueItem {
  id: string;
  action_type: string;
  status: string;
  created_at: string;
  result_message: string | null;
  correlation_id: string;
}

const tipoConfig = {
  joiner: { label: "Entrada", icon: UserPlus, class: "text-success" },
  mover: { label: "Movimentação", icon: ArrowRightLeft, class: "text-info" },
  leaver: { label: "Saída", icon: UserMinus, class: "text-destructive" },
};

const queueStatusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Processando", class: "bg-info/15 text-info border-info/30" },
  success: { label: "Concluído", class: "bg-success/15 text-success border-success/30" },
  failed: { label: "Falhou", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const actionLabels: Record<string, string> = {
  create: "Criação",
  update: "Atualização",
  disable: "Desativação",
  delete: "Exclusão",
};

export default function ColaboradorActivityPopover({ colaboradorId, colaboradorNome }: Props) {
  const [eventos, setEventos] = useState<EventoJML[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadData() {
    if (loaded) return;
    setLoading(true);
    const [evRes, atRes, queueRes] = await Promise.all([
      supabase
        .from("eventos_jml")
        .select("id, tipo, status, created_at, dados_antes, dados_depois")
        .eq("colaborador_id", colaboradorId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("perfil_atribuicoes")
        .select("id, ativo, data_concessao, data_revogacao, perfis_acesso(nome)")
        .eq("colaborador_id", colaboradorId)
        .order("data_concessao", { ascending: false })
        .limit(10),
      (supabase as any)
        .from("iam_queue")
        .select("id, action_type, status, created_at, result_message, correlation_id")
        .eq("colaborador_id", colaboradorId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setEventos((evRes.data as EventoJML[]) || []);
    setAtribuicoes((atRes.data as Atribuicao[]) || []);
    setQueueItems((queueRes.data as QueueItem[]) || []);
    setLoading(false);
    setLoaded(true);
  }

  const empty = !loading && loaded && eventos.length === 0 && atribuicoes.length === 0 && queueItems.length === 0;

  return (
    <Popover onOpenChange={(open) => open && loadData()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" title={`Atividades de ${colaboradorNome}`}>
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-96 overflow-y-auto p-0" align="start">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Atividades — {colaboradorNome}</p>
        </div>

        {loading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {empty && (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        )}

        {/* Queue items */}
        {!loading && queueItems.length > 0 && (
          <div className="p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fila de Provisionamento</p>
            {queueItems.map((item) => {
              const sCfg = queueStatusConfig[item.status] || { label: item.status, class: "" };
              return (
                <Link key={item.id} to={`/fila-provisionamento/${item.id}`} className="flex items-start gap-2 text-sm hover:bg-muted/50 rounded p-1 -m-1">
                  <ListOrdered className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{actionLabels[item.action_type] || item.action_type}</span>
                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${sCfg.class}`}>
                        {sCfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.created_at), "dd MMM yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* JML events */}
        {!loading && eventos.length > 0 && (
          <div className="p-3 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Eventos JML</p>
            {eventos.map((ev) => {
              const cfg = tipoConfig[ev.tipo];
              const Icon = cfg.icon;
              return (
                <div key={ev.id} className="flex items-start gap-2 text-sm">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.class}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{cfg.label}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {ev.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.created_at), "dd MMM yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Access profiles */}
        {!loading && atribuicoes.length > 0 && (
          <div className="p-3 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perfis de Acesso</p>
            {atribuicoes.map((at) => (
              <div key={at.id} className="flex items-start gap-2 text-sm">
                {at.ativo ? (
                  <Shield className="h-4 w-4 mt-0.5 shrink-0 text-success" />
                ) : (
                  <ShieldOff className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{at.perfis_acesso?.nome || "—"}</span>
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${at.ativo ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}`}>
                      {at.ativo ? "Ativo" : "Revogado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(at.data_concessao), "dd MMM yyyy", { locale: ptBR })}
                    {at.data_revogacao && ` → ${format(new Date(at.data_revogacao), "dd MMM yyyy", { locale: ptBR })}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
