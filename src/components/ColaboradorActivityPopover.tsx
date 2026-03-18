import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, UserPlus, ArrowRightLeft, UserMinus, Shield, ShieldOff, Cloud, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface AuditoriaItem {
  id: string;
  acao: string;
  resumo: string | null;
  timestamp: string;
}

const tipoConfig = {
  joiner: { label: "Entrada", icon: UserPlus, class: "text-success" },
  mover: { label: "Movimentação", icon: ArrowRightLeft, class: "text-info" },
  leaver: { label: "Saída", icon: UserMinus, class: "text-destructive" },
};

export default function ColaboradorActivityPopover({ colaboradorId, colaboradorNome }: Props) {
  const [eventos, setEventos] = useState<EventoJML[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[]>([]);
  const [auditoriaItems, setAuditoriaItems] = useState<AuditoriaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadData() {
    if (loaded) return;
    setLoading(true);
    const [evRes, atRes, auditRes] = await Promise.all([
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
      supabase
        .from("auditoria")
        .select("id, acao, resumo, timestamp")
        .eq("entidade", "colaborador")
        .eq("entidade_id", colaboradorId)
        .in("acao", ["criar_entra_id", "atribuir_licencas_entra", "adicionar_grupos_entra", "adicionar_apps_entra", "erro_licencas_entra", "erro_grupo_entra", "erro_apps_entra", "desativar_entra", "reativar_entra"])
        .order("timestamp", { ascending: false })
        .limit(10),
    ]);
    setEventos((evRes.data as EventoJML[]) || []);
    setAtribuicoes((atRes.data as Atribuicao[]) || []);
    setAuditoriaItems((auditRes.data as AuditoriaItem[]) || []);
    setLoading(false);
    setLoaded(true);
  }

  const empty = !loading && loaded && eventos.length === 0 && atribuicoes.length === 0 && auditoriaItems.length === 0;

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

        {!loading && eventos.length > 0 && (
          <div className="p-3 space-y-2">
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

        {!loading && auditoriaItems.length > 0 && (
          <div className="p-3 border-t space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entra ID</p>
            {auditoriaItems.map((item) => {
              const isError = item.acao.startsWith("erro_");
              return (
                <div key={item.id} className="flex items-start gap-2 text-sm">
                  {isError ? (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  ) : (
                    <Cloud className="h-4 w-4 mt-0.5 shrink-0 text-info" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug">{item.resumo || item.acao}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.timestamp), "dd MMM yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
