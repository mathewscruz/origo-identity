import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/terceiros": "Terceiros",
  "/eventos-jml": "Eventos JML",
  "/aplicacoes": "Aplicações",
  "/perfis-acesso": "Perfis de Acesso",
  "/excecoes": "Exceções",
  "/revisoes": "Revisões",
  "/regras": "Motor de Regras",
  "/regras/nova": "Nova Regra",
  "/matriz": "Matriz",
  "/licencas": "Licenças",
  "/auditoria": "Auditoria",
  "/alertas": "Alertas",
  "/configuracoes": "Configurações",
  "/configuracoes/cargos": "Cargos",
  "/configuracoes/areas": "Áreas",
  "/configuracoes/empresas": "Empresas",
  "/configuracoes/localidades": "Localidades",
  "/configuracoes/operadores": "Operadores",
  "/configuracoes/parametros": "Parâmetros",
  "/configuracoes/integracoes": "Integrações",
  "/admin": "Administração",
  "/admin/usuarios": "Usuários",
};

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
    const label = routeLabels[currentPath] || segments[i];
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
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
            <SidebarTrigger />
            <AppBreadcrumb />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative" asChild>
                <Link to="/alertas">
                  <Bell className="h-4 w-4" />
                  <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[10px]">
                    3
                  </Badge>
                </Link>
              </Button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                SA
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
