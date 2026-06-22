import { useState } from "react";
import {
  LayoutDashboard, Users, UserCheck, AppWindow, Shield,
  AlertTriangle, ClipboardCheck, Cog, Key, LogOut, UsersRound, ListOrdered, ShieldAlert, BarChart3, HandHelping, GitBranch, Crown, Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import logoImg from "@/assets/logo.png";
import { toast } from "sonner";

const sidebarGroups = [
  { label: "Operação", items: [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Fila de Provisionamento", url: "/fila-provisionamento", icon: ListOrdered },
    { title: "Solicitações", url: "/solicitacoes", icon: HandHelping },
  ]},
  { label: "Identidades", items: [
    { title: "Colaboradores", url: "/colaboradores", icon: Users },
    { title: "Terceiros", url: "/terceiros", icon: UserCheck },
  ]},
  { label: "Governança", items: [
    { title: "Aplicações", url: "/aplicacoes", icon: AppWindow },
    { title: "Perfis de Acesso", url: "/perfis-acesso", icon: Shield },
    { title: "Exceções", url: "/excecoes", icon: AlertTriangle },
    { title: "Revisões", url: "/revisoes", icon: ClipboardCheck },
    { title: "SoD / Conflitos", url: "/sod", icon: ShieldAlert },
    { title: "Privilegiados", url: "/privilegiados", icon: Crown },
    { title: "Workflow", url: "/workflow", icon: GitBranch },
  ]},
  { label: "Controle", items: [
    { title: "Licenças", url: "/licencas", icon: Key },
    { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  ]},
  { label: "Administração", items: [
    { title: "Configurações", url: "/configuracoes", icon: Settings },
    { title: "Usuários", url: "/admin/usuarios", icon: UsersRound },
  ]},
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const isActive = (url: string) => { if (url === "/") return location.pathname === "/"; return location.pathname.startsWith(url); };

  const initials = profile?.nome ? profile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  const handleLogout = async () => {
    await signOut();
    toast.success("Sessão encerrada com sucesso");
    setLogoutOpen(false);
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-2">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="Access & Identity" className={`rounded-lg object-contain shrink-0 ${collapsed ? "h-5 w-5" : "h-7 w-7"}`} />
            {!collapsed && <div className="flex flex-col"><span className="text-xs font-semibold text-sidebar-primary-foreground">Órigo Access & Identity</span><span className="text-[9px] text-sidebar-foreground/60">Sistema</span></div>}
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent className="overflow-y-hidden">
          {sidebarGroups.map((group) => (
            <SidebarGroup key={group.label} className="py-1 px-2">
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-[9px] uppercase tracking-wider font-semibold mb-0 pb-0">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton size="sm" asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent/50 text-xs" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                        <item.icon className="h-3.5 w-3.5" />{!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-2">
          {!collapsed && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/50 p-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground overflow-hidden shrink-0">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <div className="flex flex-col text-[11px] flex-1 min-w-0">
                  <span className="font-medium text-sidebar-accent-foreground truncate">{profile?.nome || "Usuário"}</span>
                  <span className="text-sidebar-foreground/50 truncate text-[10px]">{profile?.email || ""}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent h-7 text-xs" onClick={() => setLogoutOpen(true)}>
                <LogOut className="mr-2 h-3.5 w-3.5" />Sair
              </Button>
            </div>
          )}
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
