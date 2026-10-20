import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export interface SectionTab { title: string; url: string; roles?: string[] }

/** Abas de seção (ex.: Pessoas → Colaboradores | Terceiros). As páginas continuam com seus endereços. */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const visible = tabs.filter((t) => !t.roles || (role && t.roles.includes(role)));
  // detalhes (/colaboradores/:id) não mostram as abas
  const onTabRoot = visible.some((t) => pathname === t.url);
  return (
    <div className="space-y-4">
      {onTabRoot && visible.length > 1 && (
        <nav className="flex gap-1 border-b">
          {visible.map((t) => (
            <NavLink key={t.url} to={t.url} end
              className={({ isActive }) => cn("-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                isActive ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.title}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet />
    </div>
  );
}
