import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hash, MapPin, CalendarDays, UserRound, Shield, Key, Monitor, ArrowRight } from "lucide-react";
import DetailPanel, { DetailField } from "@/components/DetailPanel";
import ProductLogo from "@/components/ProductLogo";
import { useEffectiveAccess } from "@/hooks/useOrigoData";

const TIPO_ICON: Record<string, React.ComponentType<{ className?: string }>> = { grupo: Shield, licenca: Key, app: Monitor };
const TIPO_LABEL: Record<string, string> = { grupo: "Grupo", licenca: "Licença", app: "Aplicação" };

function initials(nome: string) {
  return nome.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function ColaboradorPanel({ c, statusLabel, statusClass, localidade, gestor, onClose }: {
  c: any; statusLabel: string; statusClass: string; localidade?: string; gestor?: string; onClose: () => void;
}) {
  const { data, isLoading } = useEffectiveAccess(c.id);
  const items = (data ?? []).map((a) => ({
    ...a,
    nome: String(a.payload?.nome ?? a.payload?.displayName ?? a.payload?.name ?? a.resource_key),
  }));
  const admissao = c.data_admissao ? new Date(c.data_admissao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
  return (
    <DetailPanel onClose={onClose}>
      <div className="flex items-start gap-4 pr-8">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initials(c.nome)}</span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-tight">{c.nome}</h2>
            <Badge variant="outline" className={statusClass}>{statusLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{c.cargo} · {c.area}</p>
          <p className="truncate text-sm text-muted-foreground">{c.email}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <DetailField icon={Hash} label="Matrícula" value={c.matricula} />
        <DetailField icon={MapPin} label="Local" value={localidade} />
        <DetailField icon={CalendarDays} label="Admissão" value={admissao} />
        <DetailField icon={UserRound} label="Gestor" value={gestor} />
      </div>

      <Tabs defaultValue="acessos" className="mt-5">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="acessos">Acessos{items.length ? ` (${items.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="acessos" className="mt-3">
          {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum acesso calculado para esta pessoa.</p>
            : (
              <ul className="divide-y divide-border/60">
                {items.slice(0, 8).map((a) => {
                  const Icon = TIPO_ICON[a.tipo] ?? Shield;
                  return (
                    <li key={`${a.tipo}-${a.resource_key}`} className="flex items-center gap-3 py-2">
                      {a.tipo === "licenca"
                        ? <span className="scale-75"><ProductLogo nome={a.nome} /></span>
                        : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><Icon className="h-4 w-4" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.nome}</p>
                        <p className="text-xs text-muted-foreground">{TIPO_LABEL[a.tipo] ?? a.tipo} · {a.origem === "perfil" ? "pelo cargo" : "individual"}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </TabsContent>
      </Tabs>

      <Button asChild variant="link" className="mt-3 w-full">
        <Link to={`/colaboradores/${c.id}`}>Abrir ficha completa<ArrowRight className="ml-1 h-4 w-4" /></Link>
      </Button>
    </DetailPanel>
  );
}
