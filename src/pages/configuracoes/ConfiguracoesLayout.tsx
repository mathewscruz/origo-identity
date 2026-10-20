import { Outlet } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Briefcase, Building2, MapPin, Network, Sliders, Cloud, UsersRound, Bot } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";

const ALL_NAV = [
  { title: "Parâmetros", url: "/configuracoes/parametros", icon: Sliders },
  { title: "Hermes Agent", url: "/configuracoes/agente", icon: Bot },
  { title: "Integrações", url: "/configuracoes/integracoes", icon: Cloud },
  { title: "Usuários", url: "/configuracoes/usuarios", icon: UsersRound, admin: true },
  { title: "Cargos", url: "/configuracoes/cargos", icon: Briefcase },
  { title: "Áreas", url: "/configuracoes/areas", icon: Network },
  { title: "Empresas", url: "/configuracoes/empresas", icon: Building2 },
  { title: "Localidades", url: "/configuracoes/localidades", icon: MapPin },
];

export default function ConfiguracoesLayout() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "platform_admin";
  const subNav = ALL_NAV.filter((i) => !i.admin || isAdmin);
  if (role && !isAdmin) return <div className="py-16 text-center"><h2 className="text-lg font-semibold">Acesso restrito</h2><p className="text-sm text-muted-foreground">Configurações são exclusivas do perfil Super Admin.</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Parâmetros, integrações, usuários do sistema e cadastros de apoio.</p>
      </div>

      {isMobile ? (
        /* Mobile: horizontal scrollable tabs */
        <div className="space-y-4">
          <ScrollArea data-tour="nav" className="w-full">
            <div className="flex gap-1 pb-2">
              {subNav.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground shrink-0"
                  activeClassName="bg-accent text-accent-foreground font-medium"
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </NavLink>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <div data-tour="content" className="min-w-0">
            <Outlet />
          </div>
        </div>
      ) : (
        /* Desktop: sidebar layout */
        <div className="flex gap-6">
          <nav data-tour="nav" className="flex w-48 shrink-0 flex-col gap-1">
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
          <div data-tour="content" className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      )}
      <OnboardingTour pageKey="configuracoes" steps={tourSteps.configuracoes} />
    </div>
  );
}
