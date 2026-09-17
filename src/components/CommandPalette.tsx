import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, ListOrdered, Activity, Users, UserCheck, AppWindow, Shield, AlertTriangle, ClipboardCheck,
  ShieldAlert, Crown, Key, BarChart3, ScrollText, Bell, Settings, UsersRound, Bot, SlidersHorizontal, Briefcase, Building2, MapPin, Layers,
  Plus, CheckSquare, Loader2,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { COLAB_STATUS_META } from "@/lib/queueLabels";
import { humanize } from "@/lib/labels";

const OPEN_EVENT = "origo:command-palette";
/** Abre a paleta de qualquer lugar (sidebar, header). */
export function openCommandPalette() { window.dispatchEvent(new Event(OPEN_EVENT)); }

const PAGES = [
  { label: "Dashboard", url: "/", icon: LayoutDashboard, group: "Operação" },
  { label: "Fila de Provisionamento", url: "/fila-provisionamento", icon: ListOrdered, group: "Operação", keywords: "aprovação agente hermes" },
  { label: "Aguardando aprovação", url: "/fila-provisionamento?tab=aprovacao", icon: CheckSquare, group: "Operação", keywords: "aprovar fila" },
  { label: "Eventos JML", url: "/eventos-jml", icon: Activity, group: "Operação", keywords: "joiner mover leaver" },
  { label: "Colaboradores", url: "/colaboradores", icon: Users, group: "Identidades" },
  { label: "Terceiros", url: "/terceiros", icon: UserCheck, group: "Identidades", keywords: "prestador contrato" },
  { label: "Aplicações", url: "/aplicacoes", icon: AppWindow, group: "Governança" },
  { label: "Perfis de Acesso", url: "/perfis-acesso", icon: Shield, group: "Governança" },
  { label: "Exceções", url: "/excecoes", icon: AlertTriangle, group: "Governança" },
  { label: "Revisões de acesso", url: "/revisoes", icon: ClipboardCheck, group: "Governança", keywords: "recertificação campanha" },
  { label: "SoD / Conflitos", url: "/sod", icon: ShieldAlert, group: "Governança", keywords: "segregação" },
  { label: "Privilegiados", url: "/privilegiados", icon: Crown, group: "Governança", keywords: "roles admin entra" },
  { label: "Licenças", url: "/licencas", icon: Key, group: "Controle" },
  { label: "Relatórios", url: "/relatorios", icon: BarChart3, group: "Controle" },
  { label: "Auditoria", url: "/auditoria", icon: ScrollText, group: "Controle" },
  { label: "Alertas", url: "/alertas", icon: Bell, group: "Controle", keywords: "notificações" },
  { label: "Cargos", url: "/configuracoes/cargos", icon: Briefcase, group: "Configurações" },
  { label: "Áreas", url: "/configuracoes/areas", icon: Layers, group: "Configurações" },
  { label: "Empresas", url: "/configuracoes/empresas", icon: Building2, group: "Configurações" },
  { label: "Localidades", url: "/configuracoes/localidades", icon: MapPin, group: "Configurações" },
  { label: "Parâmetros", url: "/configuracoes/parametros", icon: SlidersHorizontal, group: "Configurações", keywords: "aprovação cron periodicidade" },
  { label: "Integrações & Órigo Agente", url: "/configuracoes/integracoes", icon: Bot, group: "Configurações", keywords: "sharepoint entra csv agente hermes" },
  { label: "Usuários do painel", url: "/admin/usuarios", icon: UsersRound, group: "Configurações", roles: ["admin", "platform_admin"] },
];

const ACTIONS = [
  { label: "Novo colaborador", url: "/colaboradores?new=1", icon: Plus, roles: ["admin", "platform_admin", "operador"] },
  { label: "Novo terceiro", url: "/terceiros?new=1", icon: Plus, roles: ["admin", "platform_admin", "operador"] },
  { label: "Nova campanha de revisão", url: "/revisoes?new=1", icon: Plus, roles: ["admin", "platform_admin", "operador"] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { role } = useAuth();
  const term = useDebounced(q.trim(), 200);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  // busca de entidades (só a partir de 2 caracteres)
  const { data: hits, isFetching } = useQuery({
    queryKey: ["command_palette", term],
    enabled: open && term.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const like = `%${term.replace(/[%_]/g, "")}%`;
      const [c, t, a, p] = await Promise.all([
        supabase.from("colaboradores").select("id, nome, email, status, matricula, sam_account_name").or(`nome.ilike.${like},email.ilike.${like},matricula.ilike.${like},sam_account_name.ilike.${like}`).order("nome").limit(6),
        supabase.from("terceiros").select("id, nome, email, empresa_terceira, ativo").or(`nome.ilike.${like},email.ilike.${like},empresa_terceira.ilike.${like}`).order("nome").limit(4),
        supabase.from("aplicacoes").select("id, nome, owner").ilike("nome", like).order("nome").limit(4),
        supabase.from("perfis_acesso").select("id, nome, tipo").ilike("nome", like).order("nome").limit(4),
      ]);
      return { colabs: (c.data ?? []) as Row[], tercs: (t.data ?? []) as Row[], apps: (a.data ?? []) as Row[], perfis: (p.data ?? []) as Row[] };
    },
  });

  const go = (url: string) => { setOpen(false); navigate(url); };
  const pages = useMemo(() => PAGES.filter((p) => !p.roles || (role && p.roles.includes(role))), [role]);
  const actions = useMemo(() => ACTIONS.filter((p) => !p.roles || (role && p.roles.includes(role))), [role]);
  const groups = useMemo(() => [...new Set(pages.map((p) => p.group))], [pages]);
  const hasHits = !!hits && (hits.colabs.length + hits.tercs.length + hits.apps.length + hits.perfis.length) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12%] max-w-xl translate-y-0 overflow-hidden p-0 shadow-2xl sm:rounded-xl">
        <DialogTitle className="sr-only">Buscar ou navegar</DialogTitle>
        <Command shouldFilter={true} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
          <CommandInput value={q} onValueChange={setQ} placeholder="Buscar pessoa, aplicação, perfil ou ir para uma página…" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>{isFetching ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</span> : "Nada encontrado."}</CommandEmpty>

            {hasHits && (
              <>
                {hits!.colabs.length > 0 && (
                  <CommandGroup heading="Colaboradores">
                    {hits!.colabs.map((c) => (
                      <CommandItem key={c.id} value={`colab ${c.nome} ${c.email ?? ""} ${c.matricula ?? ""}`} onSelect={() => go(`/colaboradores/${c.id}`)}>
                        <Users className="mr-2 text-muted-foreground" />
                        <span className="flex-1 truncate">{c.nome}<span className="ml-2 text-xs text-muted-foreground">{c.email || c.sam_account_name || ""}</span></span>
                        <span className={`rounded px-1.5 py-px text-[10px] ${COLAB_STATUS_META[c.status]?.className ?? "bg-muted text-muted-foreground"}`}>{COLAB_STATUS_META[c.status]?.label ?? c.status}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {hits!.tercs.length > 0 && (
                  <CommandGroup heading="Terceiros">
                    {hits!.tercs.map((t) => (
                      <CommandItem key={t.id} value={`terc ${t.nome} ${t.email ?? ""} ${t.empresa_terceira ?? ""}`} onSelect={() => go(`/terceiros/${t.id}`)}>
                        <UserCheck className="mr-2 text-muted-foreground" />
                        <span className="flex-1 truncate">{t.nome}<span className="ml-2 text-xs text-muted-foreground">{t.empresa_terceira || t.email || ""}</span></span>
                        <span className={`rounded px-1.5 py-px text-[10px] ${t.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{t.ativo ? "ativo" : "inativo"}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {hits!.apps.length > 0 && (
                  <CommandGroup heading="Aplicações">
                    {hits!.apps.map((a) => (
                      <CommandItem key={a.id} value={`app ${a.nome}`} onSelect={() => go(`/aplicacoes/${a.id}`)}>
                        <AppWindow className="mr-2 text-muted-foreground" /><span className="flex-1 truncate">{a.nome}</span>{a.owner && <span className="truncate text-xs text-muted-foreground">{a.owner}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {hits!.perfis.length > 0 && (
                  <CommandGroup heading="Perfis de acesso">
                    {hits!.perfis.map((p) => (
                      <CommandItem key={p.id} value={`perfil ${p.nome}`} onSelect={() => go(`/perfis-acesso/${p.id}`)}>
                        <Shield className="mr-2 text-muted-foreground" /><span className="flex-1 truncate">{p.nome}</span><span className="text-xs text-muted-foreground">{humanize(p.tipo)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandSeparator />
              </>
            )}

            {actions.length > 0 && (
              <CommandGroup heading="Ações">
                {actions.map((a) => (
                  <CommandItem key={a.url} value={`acao ${a.label}`} onSelect={() => go(a.url)}><a.icon className="mr-2 text-primary" />{a.label}</CommandItem>
                ))}
              </CommandGroup>
            )}
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {pages.filter((p) => p.group === g).map((p) => (
                  <CommandItem key={p.url} value={`pagina ${p.label} ${p.keywords ?? ""}`} onSelect={() => go(p.url)}>
                    <p.icon className="mr-2 text-muted-foreground" />{p.label}
                    {p.url === "/" && <CommandShortcut>Início</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            <span><kbd className="rounded border bg-muted px-1 font-mono">↑↓</kbd> navegar · <kbd className="rounded border bg-muted px-1 font-mono">Enter</kbd> abrir · <kbd className="rounded border bg-muted px-1 font-mono">Esc</kbd> fechar</span>
            <span>Ctrl K</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
