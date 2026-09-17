import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { NotificacoesBell } from "@/components/NotificacoesBell";
import CommandPalette, { openCommandPalette } from "@/components/CommandPalette";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatarUrl } from "@/lib/avatarUrl";
import ForcePasswordChangeDialog from "@/components/ForcePasswordChangeDialog";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Home, Search, LogOut, Bot, Bell, Eye, Pencil } from "lucide-react";
import { useCanEdit } from "@/hooks/useRole";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/terceiros": "Terceiros",
  "/eventos-jml": "Eventos JML",
  "/aplicacoes": "Aplicações",
  "/perfis-acesso": "Perfis de Acesso",
  "/excecoes": "Exceções",
  "/revisoes": "Revisões",
  "/licencas": "Licenças",
  "/sod": "SoD / Conflitos",
  "/privilegiados": "Privilegiados",
  "/relatorios": "Relatórios",
  "/fila-provisionamento": "Fila de Provisionamento",
  "/configuracoes": "Configurações",
  "/configuracoes/cargos": "Cargos",
  "/configuracoes/areas": "Áreas",
  "/configuracoes/empresas": "Empresas",
  "/configuracoes/localidades": "Localidades",
  "/configuracoes/parametros": "Parâmetros",
  "/configuracoes/integracoes": "Integrações",
  "/auditoria": "Auditoria",
  "/alertas": "Alertas",
  "/admin": "Administração",
  "/admin/usuarios": "Usuários",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AppBreadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const crumbs: { label: string; path: string; isLast: boolean }[] = [];
  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    // /admin sozinho não existe como página
    if (currentPath === "/admin") continue;
    let label = routeLabels[currentPath] || segments[i];
    if (UUID_REGEX.test(segments[i])) label = "Detalhe";
    crumbs.push({ label, path: currentPath, isLast: i === segments.length - 1 });
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-[13px] sm:gap-1.5">
        <BreadcrumbItem>
          {segments.length === 0
            ? <BreadcrumbPage className="flex items-center gap-1.5 font-medium"><Home className="h-3.5 w-3.5" />Dashboard</BreadcrumbPage>
            : <BreadcrumbLink asChild><Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><Home className="h-3.5 w-3.5" /><span className="hidden sm:inline">Dashboard</span></Link></BreadcrumbLink>}
        </BreadcrumbItem>
        {crumbs.map((crumb) => (
          <span key={crumb.path} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {crumb.isLast
                ? <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                : <BreadcrumbLink asChild><Link to={crumb.path} className="truncate">{crumb.label}</Link></BreadcrumbLink>}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

const ROLE_LABEL: Record<string, string> = { platform_admin: "Platform admin", admin: "Administrador", operador: "Operador", viewer: "Leitura" };

export default function AppLayout() {
  const { profile, role, mustChangePassword, refreshProfile, signOut } = useAuth();
  const avatarSrc = useAvatarUrl(profile?.avatar_url);
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  useRealtimeSync();
  const initials = profile?.nome ? profile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-4">
            <SidebarTrigger className="text-muted-foreground" />
            <div className="hidden h-5 w-px bg-border sm:block" />
            <AppBreadcrumb />
            <div className="ml-auto flex items-center gap-1.5">
              {!canEdit && (
                <Tooltip><TooltipTrigger asChild><span className="mr-1 hidden items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground md:inline-flex"><Eye className="h-3 w-3" />Somente leitura</span></TooltipTrigger><TooltipContent>Seu papel permite consultar, não operar.</TooltipContent></Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2 text-muted-foreground md:min-w-[220px] md:justify-start" onClick={openCommandPalette}>
                    <Search className="h-3.5 w-3.5" /><span className="hidden md:inline">Buscar pessoa, app, perfil…</span>
                    <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] md:inline">Ctrl K</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar e navegar (Ctrl K)</TooltipContent>
              </Tooltip>
              <NotificacoesBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-offset-background transition hover:ring-2 hover:ring-primary/30 hover:ring-offset-2" aria-label="Conta">
                    {avatarSrc ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="font-normal">
                    <p className="truncate text-sm font-medium">{profile?.nome || "Usuário"}</p>
                    <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Papel: <span className="font-medium text-foreground">{ROLE_LABEL[role ?? ""] ?? role ?? "—"}</span></p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/alertas")}><Bell className="mr-2 h-4 w-4" />Alertas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/configuracoes/integracoes")}><Bot className="mr-2 h-4 w-4" />Órigo Agente & integrações</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/configuracoes/parametros")}><Pencil className="mr-2 h-4 w-4" />Parâmetros</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 md:p-6 lg:p-8">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
      <CommandPalette />
      <ForcePasswordChangeDialog open={mustChangePassword} onComplete={refreshProfile} />
    </SidebarProvider>
  );
}
