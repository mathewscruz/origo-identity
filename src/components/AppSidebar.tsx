import {
  LayoutDashboard, Users, UserCheck, GitPullRequest, AppWindow, Shield,
  AlertTriangle, ClipboardCheck, Cog, Grid3X3, Key, FileText, Bell, Settings, LogOut, UsersRound, ListOrdered,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo.png";

const sidebarGroups = [
  { label: "Operação", items: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Fila de Provisionamento", url: "/fila-provisionamento", icon: ListOrdered },
  ]},
  { label: "Identidades", items: [
    { title: "Colaboradores", url: "/colaboradores", icon: Users },
    { title: "Terceiros", url: "/terceiros", icon: UserCheck },
    { title: "Eventos JML", url: "/eventos-jml", icon: GitPullRequest },
  ]},
  { label: "Governança", items: [
    { title: "Aplicações", url: "/aplicacoes", icon: AppWindow },
    { title: "Perfis de Acesso", url: "/perfis-acesso", icon: Shield },
    { title: "Exceções", url: "/excecoes", icon: AlertTriangle },
    { title: "Revisões", url: "/revisoes", icon: ClipboardCheck },
  ]},
  { label: "Controle", items: [
    { title: "Motor de Regras", url: "/regras", icon: Cog },
    { title: "Matriz", url: "/matriz", icon: Grid3X3 },
    { title: "Licenças", url: "/licencas", icon: Key },
  ]},
  { label: "Sistema", items: [
    { title: "Configurações", url: "/configuracoes", icon: Settings },
    { title: "Usuários", url: "/admin/usuarios", icon: UsersRound },
  ]},
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut } = useAuth();

  const isActive = (url: string) => { if (url === "/") return location.pathname === "/"; return location.pathname.startsWith(url); };

  const initials = profile?.nome ? profile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="Access & Identity" className="h-8 w-8 rounded-lg" />
          {!collapsed && <div className="flex flex-col"><span className="text-sm font-semibold text-sidebar-primary-foreground">Access & Identity</span><span className="text-[10px] text-sidebar-foreground/60">Sistema</span></div>}
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {sidebarGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider font-semibold">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="h-4 w-4" />{!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/50 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">{initials}</div>
              <div className="flex flex-col text-xs flex-1 min-w-0">
                <span className="font-medium text-sidebar-accent-foreground truncate">{profile?.nome || "Usuário"}</span>
                <span className="text-sidebar-foreground/50 truncate">{profile?.email || ""}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />Sair
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
