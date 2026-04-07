import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotificacoesBell() {
  const [alertas, setAlertas] = useState<any[]>([]);
  const [naoLidos, setNaoLidos] = useState(0);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const fetchAlertas = async () => {
    const { data, count } = await supabase
      .from("alertas")
      .select("*", { count: "exact" })
      .eq("lido", false)
      .order("created_at", { ascending: false })
      .limit(10);
    setAlertas(data || []);
    setNaoLidos(count || 0);
  };

  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = async (alerta: any) => {
    // Mark as read
    await supabase.from("alertas").update({ lido: true } as any).eq("id", alerta.id);
    setOpen(false);
    if (alerta.ref_url) {
      navigate(alerta.ref_url);
    }
    fetchAlertas();
  };

  const marcarTodosLidos = async () => {
    const ids = alertas.map(a => a.id);
    if (ids.length > 0) {
      for (const id of ids) {
        await supabase.from("alertas").update({ lido: true } as any).eq("id", id);
      }
    }
    fetchAlertas();
  };

  const severidadeCor = (s: string) => {
    switch (s) {
      case "critico": return "bg-destructive text-destructive-foreground";
      case "aviso": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {naoLidos > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {naoLidos > 99 ? "99+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notificações</span>
          {naoLidos > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={marcarTodosLidos}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {alertas.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação pendente
            </div>
          ) : (
            <div className="divide-y">
              {alertas.map(a => (
                <button
                  key={a.id}
                  onClick={() => handleClick(a)}
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Badge className={`mt-0.5 text-[10px] px-1.5 py-0 shrink-0 ${severidadeCor(a.severidade)}`}>
                      {a.severidade}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.titulo}</p>
                      {a.mensagem && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.mensagem}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        {alertas.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); navigate("/configuracoes/alertas"); }}>
              Ver todos os alertas
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
