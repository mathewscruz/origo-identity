import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import ModoOperacaoBanner from "@/components/ModoOperacaoBanner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Link } from "react-router-dom";
import { NotificacoesBell } from "@/components/NotificacoesBell";
import { useAuth } from "@/contexts/AuthContext";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/terceiros": "Terceiros",
  "/eventos-jml": "Eventos JML",
  "/aplicacoes": "Aplicações",
  "/perfis-acesso": "Perfis de Acesso",
  "/excecoes": "Exceções",
  "/revisoes": "Revisões",
  "/matriz": "Matriz",
  "/licencas": "Licenças",
  "/sod": "SoD / Conflitos",
  "/privilegiados": "Privilegiados",
  "/relatorios": "Relatórios",
  "/solicitacoes": "Solicitações",
  "/workflow": "Workflow",
  "/fila-provisionamento": "Fila de Provisionamento",
  "/configuracoes": "Configurações",
  "/configuracoes/cargos": "Cargos",
  "/configuracoes/areas": "Áreas",
  "/configuracoes/empresas": "Empresas",
  "/configuracoes/localidades": "Localidades",
  
  "/configuracoes/parametros": "Parâmetros",
  "/configuracoes/integracoes": "Integrações",
  "/configuracoes/auditoria": "Auditoria",
  "/configuracoes/alertas": "Alertas",
  "/admin": "Administração",
  "/admin/usuarios": "Usuários",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AppBreadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const crumbs: { label: string; path: string; isLast: boolean }[] = [];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    let label = routeLabels[currentPath] || segments[i];
    if (UUID_REGEX.test(segments[i])) label = "Detalhe";
    crumbs.push({ label, path: currentPath, isLast: i === segments.length - 1 });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <BreadcrumbItem key={crumb.path}>
            {i > 0 && <BreadcrumbSeparator />}
            {crumb.isLast ? (
              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link to={crumb.path}>{crumb.label}</Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function AppLayout() {
  const { profile } = useAuth();
  const initials = profile?.nome ? profile.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() : "??";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <ModoOperacaoBanner />
          <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
            <SidebarTrigger />
            <AppBreadcrumb />
            <div className="ml-auto flex items-center gap-2">
              <NotificacoesBell />
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground overflow-hidden">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-3 md:p-6">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
