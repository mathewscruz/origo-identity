import { Outlet, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Briefcase, Building2, MapPin, Network, Users, Sliders, Cloud, FileText, Bell } from "lucide-react";

const subNav = [
  { title: "Cargos", url: "/configuracoes/cargos", icon: Briefcase },
  { title: "Áreas", url: "/configuracoes/areas", icon: Network },
  { title: "Empresas", url: "/configuracoes/empresas", icon: Building2 },
  { title: "Localidades", url: "/configuracoes/localidades", icon: MapPin },
  { title: "Operadores", url: "/configuracoes/operadores", icon: Users },
  { title: "Parâmetros", url: "/configuracoes/parametros", icon: Sliders },
  { title: "Integrações", url: "/configuracoes/integracoes", icon: Cloud },
  { title: "Auditoria", url: "/configuracoes/auditoria", icon: FileText },
  { title: "Alertas", url: "/configuracoes/alertas", icon: Bell },
];

export default function ConfiguracoesLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerenciamento de dados base do sistema</p>
      </div>
      <div className="flex gap-6">
        <nav className="flex w-48 shrink-0 flex-col gap-1">
          {subNav.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeClassName="bg-accent text-accent-foreground font-medium"
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
