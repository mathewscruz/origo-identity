import { useState } from "react";
import {
  LayoutDashboard, Users, UserCheck, AppWindow, Shield, AlertTriangle, ClipboardCheck, Key, LogOut,
  UsersRound, ListOrdered, ShieldAlert, BarChart3, Crown, Settings, Activity, Bot, ChevronsUpDown, Bell, ScrollText, Search,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatarUrl } from "@/lib/avatarUrl";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import logoImg from "@/assets/logo.png";
import { toast } from "sonner";
import { useDashboardMetrics, useAgentStatus } from "@/hooks/useOrigoData";
import { cn } from "@/lib/utils";
import { openCommandPalette } from "@/components/CommandPalette";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Metrics = any;

type Item = {
  title: string; url: string; icon: typeof LayoutDashboard;
  /** contador em tempo real (dashboard_metrics) e tom do badge */
  badge?: (m: Metrics) => number; tone?: "warning" | "destructive" | "info";
  roles?: string[];
};

const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Operação", items: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Fila de Provisionamento", url: "/fila-provisionamento", icon: ListOrdered, badge: (m) => (m?.fila_waiting ?? 0) + (m?.fila_failed ?? 0), tone: "warning" },
    { title: "Eventos JML", url: "/eventos-jml", icon: Activity },
  ]},
  { label: "Identidades", items: [
    { title: "Colaboradores", url: "/colaboradores", icon: Users },
    { title: "Terceiros", url: "/terceiros", icon: UserCheck, badge: (m) => m?.terc_vencidos ?? 0, tone: "destructive" },
  ]},
  { label: "Governança", items: [
    { title: "Aplicações", url: "/aplicacoes", icon: AppWindow },
    { title: "Perfis de Acesso", url: "/perfis-acesso", icon: Shield },
    { title: "Exceções", url: "/excecoes", icon: AlertTriangle, badge: (m) => m?.excecoes_pendentes ?? 0, tone: "warning" },
    { title: "Revisões", url: "/revisoes", icon: ClipboardCheck, badge: (m) => m?.revisoes_abertas ?? 0, tone: "info" },
    { title: "SoD / Conflitos", url: "/sod", icon: ShieldAlert },
    { title: "Privilegiados", url: "/privilegiados", icon: Crown },
  ]},
  { label: "Controle", items: [
    { title: "Licenças", url: "/licencas", icon: Key },
    { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
    { title: "Auditoria", url: "/auditoria", icon: ScrollText },
    { title: "Alertas", url: "/alertas", icon: Bell, badge: (m) => m?.alertas_nao_lidos ?? 0, tone: "destructive" },
  ]},
  { label: "Administração", items: [
    { title: "Configurações", url: "/configuracoes", icon: Settings },
    { title: "Usuários", url: "/admin/usuarios", icon: UsersRound, roles: ["admin", "platform_admin"] },
  ]},
];

const ROLE_LABEL: Record<string, string> = { platform_admin: "Platform admin", admin: "Administrador", operador: "Operador", viewer: "Leitura" };
const ENV = /127\.0\.0\.1|localhost/.test(import.meta.env.VITE_SUPABASE_URL ?? "") ? "local" : import.meta.env.MODE === "development" ? "dev" : null;

const TONE: Record<NonNullable<Item["tone"]>, string> = {
  warning: "bg-warning/20 text-warning",
  destructive: "bg-destructive/25 text-red-300",
  info: "bg-primary/25 text-primary-foreground",
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const avatarSrc = useAvatarUrl(profile?.avatar_url);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { data: metrics } = useDashboardMetrics();
  const { data: agents } = useAgentStatus();

  const agent = agents?.[0];
  const agentAgeMin = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentState = !agent ? "never" : agentAgeMin <= 5 ? "online" : agentAgeMin <= 30 ? "stale" : "offline";
  const agentMeta = {
    online: { dot: "bg-success", label: "Agente online", hint: `v${agent?.version ?? "?"} · ${agent?.execute_mode ? "executando" : "dry-run"}` },
    stale: { dot: "bg-warning", label: "Agente sem sinal", hint: `há ${Math.round(agentAgeMin)} min` },
    offline: { dot: "bg-destructive", label: "Agente offline", hint: `há ${agentAgeMin > 1440 ? `${Math.round(agentAgeMin / 1440)} d` : `${Math.round(agentAgeMin / 60)} h`}` },
    never: { dot: "bg-muted-foreground", label: "Agente nunca visto", hint: "instale o Órigo Agente" },
  }[agentState];

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };
  const initials = profile?.nome ? profile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  const handleLogout = async () => {
    await signOut();
    toast.success("Sessão encerrada com sucesso");
    setLogoutOpen(false);
  };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className={cn("p-3", collapsed && "p-2")}>
          <button type="button" onClick={() => navigate("/")} className={cn("flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-sidebar-accent/60", collapsed ? "justify-center p-1" : "p-1.5")} title="Dashboard">
            <img src={logoImg} alt="Órigo" className={cn("shrink-0 rounded-lg object-contain shadow-sm ring-1 ring-white/10", collapsed ? "h-7 w-7" : "h-8 w-8")} />
            {!collapsed && (
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-sidebar-primary-foreground">Órigo Access & Identity</span>
                <span className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/55">IGA · Hermes
                  {ENV && <span className="rounded bg-warning/20 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-warning">{ENV}</span>}
                </span>
              </div>
            )}
          </button>
          {!collapsed && (
            <button type="button" onClick={openCommandPalette} className="mt-2 flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 text-left text-[11px] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground">
              <Search className="h-3.5 w-3.5" /><span className="flex-1">Buscar ou navegar…</span>
              <kbd className="rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[9px] text-sidebar-foreground/50">Ctrl K</kbd>
            </button>
          )}
        </SidebarHeader>

        <SidebarContent className="overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
          {GROUPS.map((group) => {
            const items = group.items.filter((it) => !it.roles || (role && it.roles.includes(role)));
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.label} className={cn("px-2 py-1", collapsed && "px-1.5")}>
                {!collapsed && <SidebarGroupLabel className="mb-0.5 h-5 px-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">{group.label}</SidebarGroupLabel>}
                <SidebarGroupContent><SidebarMenu className="gap-px">
                  {items.map((item) => {
                    const active = isActive(item.url);
                    const count = item.badge ? item.badge(metrics) : 0;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton size="sm" asChild isActive={active} tooltip={count > 0 ? `${item.title} (${count})` : item.title} className="h-8 rounded-md">
                          <NavLink to={item.url} end={item.url === "/"}
                            className={cn("relative text-[12.5px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground", collapsed && "justify-center")}
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-sidebar-primary">
                            <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
                            {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
                            {count > 0 && (collapsed
                              ? <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar", item.tone === "destructive" ? "bg-destructive" : item.tone === "info" ? "bg-primary" : "bg-warning")} />
                              : <span className={cn("ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums leading-4", TONE[item.tone ?? "warning"])}>{count > 99 ? "99+" : count}</span>)}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu></SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>

        <SidebarFooter className={cn("gap-2 border-t border-sidebar-border p-2", collapsed && "items-center")}>
          {/* estado do executor — visível em toda tela */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => navigate("/configuracoes/integracoes")} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60", collapsed && "justify-center px-1")}>
                <span className="relative flex h-4 w-4 items-center justify-center"><Bot className="h-4 w-4 text-sidebar-foreground/70" /><span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-sidebar", agentMeta.dot, agentState === "online" && "animate-pulse")} /></span>
                {!collapsed && <span className="flex min-w-0 flex-col leading-tight"><span className="truncate text-[11px] font-medium text-sidebar-foreground/90">{agentMeta.label}</span><span className="truncate text-[10px] text-sidebar-foreground/50">{agentMeta.hint}</span></span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{agentMeta.label} — {agentMeta.hint}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn("flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent", collapsed && "justify-center")}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground ring-2 ring-sidebar-accent">
                  {avatarSrc ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                {!collapsed && (
                  <>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-[12px] font-medium text-sidebar-accent-foreground">{profile?.nome || "Usuário"}</span>
                      <span className="truncate text-[10px] text-sidebar-foreground/55">{ROLE_LABEL[role ?? ""] ?? role ?? "—"}</span>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{profile?.nome || "Usuário"}</p>
                <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Papel: <span className="font-medium text-foreground">{ROLE_LABEL[role ?? ""] ?? role ?? "—"}</span></p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/alertas")}><Bell className="mr-2 h-4 w-4" />Alertas{(metrics?.alertas_nao_lidos ?? 0) > 0 && <span className="ml-auto text-xs text-muted-foreground">{metrics.alertas_nao_lidos}</span>}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/configuracoes/integracoes")}><Bot className="mr-2 h-4 w-4" />Órigo Agente & integrações</DropdownMenuItem>
              {(role === "admin" || role === "platform_admin") && <DropdownMenuItem onClick={() => navigate("/admin/usuarios")}><UsersRound className="mr-2 h-4 w-4" />Usuários do painel</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setLogoutOpen(true)}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

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
