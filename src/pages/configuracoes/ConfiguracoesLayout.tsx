import { Outlet } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Briefcase, Network, Sliders, UsersRound, Bot } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useParametros } from "@/hooks/useOrigoData";
import { ESSENCIAIS } from "./ParametrosPage";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const ALL_NAV = [
  { title: "Geral", url: "/configuracoes/geral", icon: Sliders, desc: "Regras de aprovação, base do RH, e-mails e governança." },
  { title: "Hermes e conexões", url: "/configuracoes/hermes", icon: Bot, desc: "Estado do agente, rotinas e sistemas conectados." },
  { title: "Usuários do painel", url: "/configuracoes/usuarios", icon: UsersRound, admin: true, desc: "Quem opera o sistema e com qual perfil." },
  { title: "Cargos", url: "/configuracoes/cargos", icon: Briefcase, desc: "Cargos e os perfis de acesso que cada um recebe." },
  { title: "Estrutura", url: "/configuracoes/estrutura", icon: Network, desc: "Áreas, empresas e localidades." },
];

export default function ConfiguracoesLayout() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const { data: parametros } = useParametros();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faltando = ESSENCIAIS.filter((e) => !String(((parametros ?? []) as any[]).find((p) => p.chave === e.key)?.valor ?? "").trim()).length;
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "platform_admin";
  const subNav = ALL_NAV.filter((i) => !i.admin || isAdmin);
  if (role && !isAdmin) return <div className="py-16 text-center"><h2 className="text-lg font-semibold">Acesso restrito</h2><p className="text-sm text-muted-foreground">Configurações são exclusivas do perfil Super Admin.</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">{subNav.find((i) => pathname.startsWith(i.url))?.desc ?? "Regras, agente, usuários e cadastros de apoio."}</p>
      </div>

      {isMobile ? (
        /* Mobile: horizontal scrollable tabs */
        <div className="space-y-4">
          <ScrollArea className="w-full">
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
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      ) : (
        /* Desktop: sidebar layout */
        <div className="flex gap-6">
          <nav className="flex w-52 shrink-0 flex-col gap-0.5 self-start rounded-lg border bg-card p-1.5">
            {subNav.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                activeClassName="bg-primary/10 text-primary font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary"
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.title}</span>
                {item.url.endsWith("/geral") && faltando > 0 && <span className={cn("h-2 w-2 rounded-full bg-warning")} title="Configuração faltando" />}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      )}
    </div>
  );
}
