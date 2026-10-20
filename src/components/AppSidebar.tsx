import { useState } from "react";
import {
  LayoutDashboard, Users, AppWindow, Shield, AlertTriangle, ClipboardCheck, LogOut,
  ListOrdered, ShieldAlert, Settings, Bot, ScrollText, ChevronRight,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import logoImg from "@/assets/logo.png";
import { toast } from "sonner";
import { useDashboardMetrics, useAgentStatus } from "@/hooks/useOrigoData";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Metrics = any;

type Item = {
  title: string; url: string; icon: typeof LayoutDashboard;
  badge?: (m: Metrics) => number; tone?: "warning" | "destructive" | "info";
  roles?: string[];
  children?: { title: string; url: string }[];
};

const ITEMS: Item[] = [
  { title: "Início", url: "/", icon: LayoutDashboard },
  { title: "Fila", url: "/fila-provisionamento", icon: ListOrdered, badge: (m) => (m?.fila_waiting ?? 0) + (m?.fila_failed ?? 0), tone: "warning",
    children: [{ title: "Aprovações e Fila", url: "/fila-provisionamento" }, { title: "Eventos JML", url: "/eventos-jml" }] },
  { title: "Pessoas", url: "/colaboradores", icon: Users, badge: (m) => m?.terc_vencidos ?? 0, tone: "destructive",
    children: [{ title: "Colaboradores", url: "/colaboradores" }, { title: "Terceiros", url: "/terceiros" }] },
  { title: "Aplicações", url: "/aplicacoes", icon: AppWindow },
  { title: "Perfis", url: "/perfis-acesso", icon: Shield },
  { title: "Revisões", url: "/revisoes", icon: ClipboardCheck, badge: (m) => m?.revisoes_abertas ?? 0, tone: "info" },
  { title: "Exceções", url: "/excecoes", icon: AlertTriangle, badge: (m) => m?.excecoes_pendentes ?? 0, tone: "warning" },
  { title: "Riscos", url: "/sod", icon: ShieldAlert,
    children: [{ title: "Segregação de funções", url: "/sod" }, { title: "Privilegiados", url: "/privilegiados" }, { title: "Licenças", url: "/licencas" }] },
  { title: "Auditoria", url: "/auditoria", icon: ScrollText,
    children: [{ title: "Auditoria", url: "/auditoria" }, { title: "Relatórios", url: "/relatorios" }, { title: "Alertas", url: "/alertas" }] },
  { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["platform_admin", "admin"],
    children: [{ title: "Configurações", url: "/configuracoes" }, { title: "Usuários do painel", url: "/admin/usuarios" }] },
];

const DOT: Record<NonNullable<Item["tone"]>, string> = { warning: "bg-warning", destructive: "bg-destructive", info: "bg-primary" };

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { data: metrics } = useDashboardMetrics();
  const { data: agents } = useAgentStatus();

  const agent = agents?.[0];
  const ageMin = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentState = !agent ? "never" : ageMin <= 5 ? "online" : ageMin <= 30 ? "stale" : "offline";
  const agentMeta = {
    online: { dot: "bg-success", label: "Hermes online" },
    stale: { dot: "bg-warning", label: `Hermes sem sinal há ${Math.round(ageMin)} min` },
    offline: { dot: "bg-destructive", label: "Hermes offline" },
    never: { dot: "bg-muted-foreground", label: "Hermes nunca visto" },
  }[agentState];

  const matches = (url: string) => url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);
  const isActive = (it: Item) => matches(it.url) || !!it.children?.some((c) => matches(c.url));

  const handleLogout = async () => {
    await signOut();
    toast.success("Sessão encerrada com sucesso");
    setLogoutOpen(false);
  };

  const cell = (active: boolean) => cn(
    "relative flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-2 text-[10px] leading-tight transition-colors",
    active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  );

  const inner = (it: Item, active: boolean, count: number) => (
    <>
      {active && <span className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-sidebar-primary" />}
      <span className="relative">
        <it.icon className={cn("h-5 w-5", active ? "text-sidebar-primary" : "text-sidebar-foreground/70")} strokeWidth={1.75} />
        {count > 0 && <span className={cn("absolute -right-1.5 -top-1 h-2 w-2 rounded-full ring-2 ring-sidebar", DOT[it.tone ?? "warning"])} />}
      </span>
      <span className="w-full truncate text-center">{it.title}</span>
    </>
  );

  return (
    <>
      <aside className="sticky top-0 flex h-screen w-[92px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3">
        <button type="button" onClick={() => navigate("/")} className="mb-3 rounded-lg p-1" title="Início">
          <img src={logoImg} alt="Órigo" className="h-9 w-9 rounded-lg object-contain" />
        </button>

        <nav className="flex w-full flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 [scrollbar-width:none]">
          {ITEMS.filter((it) => !it.roles || (role && it.roles.includes(role))).map((it) => {
            const active = isActive(it);
            const count = it.badge ? it.badge(metrics) : 0;
            if (!it.children) {
              return <Link key={it.title} to={it.url} className={cell(active)} title={count > 0 ? `${it.title} (${count})` : it.title}>{inner(it, active, count)}</Link>;
            }
            return (
              <Popover key={it.title} open={openMenu === it.title} onOpenChange={(o) => setOpenMenu(o ? it.title : null)}>
                <PopoverTrigger asChild>
                  <button type="button" className={cell(active)}>{inner(it, active, count)}</button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start" sideOffset={10} className="w-56 border-sidebar-border bg-sidebar p-1.5 text-sidebar-foreground shadow-xl">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50">{it.title}</p>
                  {it.children.map((c) => (
                    <Link key={c.url} to={c.url} onClick={() => setOpenMenu(null)}
                      className={cn("flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground", matches(c.url) && "bg-sidebar-accent font-medium text-sidebar-primary")}>
                      {c.title}<ChevronRight className="h-3.5 w-3.5 opacity-50" />
                    </Link>
                  ))}
                </PopoverContent>
              </Popover>
            );
          })}
        </nav>

        <div className="mt-2 flex w-full flex-col items-center gap-1 border-t border-sidebar-border px-2 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => navigate("/configuracoes/hermes")} className="relative rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent/60">
                <Bot className="h-5 w-5" strokeWidth={1.75} />
                <span className={cn("absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-sidebar", agentMeta.dot)} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{agentMeta.label}</TooltipContent>
          </Tooltip>
          <button type="button" onClick={() => setLogoutOpen(true)} className={cell(false)}>
            <LogOut className="h-5 w-5" strokeWidth={1.75} /><span>Sair</span>
          </button>
        </div>
      </aside>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do sistema</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente encerrar sua sessão?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
