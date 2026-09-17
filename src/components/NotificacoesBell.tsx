import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Check, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SEVERIDADE_META, alertaTipoIcon, alertaTipoLabel, tempoRelativo } from "@/lib/alertLabels";
import { useCanEdit } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Alerta = any;

const ORDEM: Record<string, number> = { critico: 0, aviso: 1, info: 2 };

export function NotificacoesBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = useCanEdit();

  // tempo real: useRealtimeSync invalida "alertas*" quando a tabela muda
  const { data } = useQuery({
    queryKey: ["alertas_nao_lidos"],
    queryFn: async () => {
      const { data, count } = await supabase.from("alertas").select("*", { count: "exact" }).eq("lido", false).order("created_at", { ascending: false }).limit(30);
      const sorted = (data || []).sort((a: Alerta, b: Alerta) => (ORDEM[a.severidade] ?? 3) - (ORDEM[b.severidade] ?? 3) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { alertas: sorted as Alerta[], naoLidos: count || 0 };
    },
    staleTime: 30_000,
  });
  const alertas = data?.alertas ?? [];
  const naoLidos = data?.naoLidos ?? 0;
  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["alertas_nao_lidos"] }); qc.invalidateQueries({ queryKey: ["alertas"] }); qc.invalidateQueries({ queryKey: ["dashboard_metrics"] }); };

  const marcarLido = async (ids: string[] | null) => {
    if (!canEdit) return;
    await supabase.rpc("alertas_marcar_lidos", { p_ids: ids });
    refresh();
  };
  const abrir = async (a: Alerta) => {
    setOpen(false);
    if (a.ref_url) navigate(a.ref_url);
    await marcarLido([a.id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={`Notificações${naoLidos ? ` (${naoLidos} não lidas)` : ""}`}>
              <Bell className="h-[18px] w-[18px]" />
              {naoLidos > 0 && (
                <span className={cn("absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-card", criticos > 0 ? "bg-destructive" : "bg-warning")}>
                  {naoLidos > 99 ? "99+" : naoLidos}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{naoLidos ? `${naoLidos} alerta(s) não lido(s)${criticos ? ` · ${criticos} crítico(s)` : ""}` : "Sem alertas pendentes"}</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div><p className="text-sm font-semibold">Notificações</p><p className="text-[11px] text-muted-foreground">{naoLidos ? `${naoLidos} não lida(s)${criticos ? ` · ${criticos} crítica(s)` : ""}` : "Tudo em dia"}</p></div>
          {naoLidos > 0 && canEdit && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => marcarLido(null)}><CheckCheck className="h-3.5 w-3.5" />Marcar todas</Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {alertas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success"><Check className="h-5 w-5" /></span>
              <p className="text-sm font-medium">Nenhuma notificação pendente</p>
              <p className="text-xs text-muted-foreground">Novos alertas aparecem aqui em tempo real.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {alertas.map((a) => {
                const sev = SEVERIDADE_META[a.severidade] ?? SEVERIDADE_META.info;
                const Icon = alertaTipoIcon(a.tipo);
                return (
                  <li key={a.id} className="group relative">
                    <button type="button" onClick={() => abrir(a)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50">
                      <span className={cn("relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", a.severidade === "critico" ? "bg-destructive/10 text-destructive" : a.severidade === "aviso" ? "bg-warning/10 text-warning" : "bg-info/10 text-info")}>
                        <Icon className="h-4 w-4" />
                        <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-popover", sev.dot)} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="truncate text-[13px] font-medium">{a.titulo}</span></span>
                        {a.mensagem && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{a.mensagem}</span>}
                        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/70"><span>{alertaTipoLabel(a.tipo)}</span><span>·</span><span>{tempoRelativo(a.created_at)}</span>{a.ref_url && <ArrowUpRight className="h-3 w-3" />}</span>
                      </span>
                    </button>
                    {canEdit && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={(e) => { e.stopPropagation(); marcarLido([a.id]); }} className="absolute right-3 top-3 hidden h-6 w-6 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground group-hover:flex" aria-label="Marcar como lido"><Check className="h-3 w-3" /></button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Marcar como lido</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-2 py-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs" onClick={() => { setOpen(false); navigate("/alertas"); }}>Ver todos os alertas<ArrowUpRight className="h-3.5 w-3.5" /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
