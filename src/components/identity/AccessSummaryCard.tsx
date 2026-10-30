import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Shield, Key, Monitor } from "lucide-react";
import ProductLogo from "@/components/ProductLogo";
import { useEffectiveAccess } from "@/hooks/useOrigoData";

type Item = { tipo: string; resource_key: string; nome: string };

export default function AccessSummaryCard({ colaboradorId, terceiroId }: { colaboradorId?: string; terceiroId?: string }) {
  const { data, isLoading } = useEffectiveAccess(colaboradorId, terceiroId);
  const items: Item[] = ((data ?? []) as any[]).map((a) => ({
    tipo: a.tipo, resource_key: a.resource_key,
    nome: String(a.payload?.groupName ?? a.payload?.licenseName ?? a.payload?.appName ?? a.resource_key),
  }));
  const grupos = items.filter((i) => i.tipo === "grupo");
  const licencas = items.filter((i) => i.tipo === "licenca");
  const apps = items.filter((i) => i.tipo === "app" || i.tipo === "app_interno");

  const Chips = ({ list }: { list: Item[] }) => list.length === 0
    ? <p className="text-xs text-muted-foreground">Nenhum.</p>
    : <div className="flex flex-wrap gap-1.5">{list.slice(0, 12).map((i) => <span key={i.resource_key} className="rounded-full bg-muted px-2.5 py-1 text-xs">{i.nome}</span>)}{list.length > 12 && <span className="px-1 py-1 text-xs text-muted-foreground">+{list.length - 12}</span>}</div>;

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Lock className="h-4 w-4" />Resumo de acessos</h3>
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {([[Shield, grupos.length, "Grupos"], [Key, licencas.length, "Licenças"], [Monitor, apps.length, "Aplicações"]] as const).map(([Icon, n, l]) => (
                <div key={l} className="rounded-lg bg-primary/10 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-primary"><Icon className="h-4 w-4" /><span className="text-xl font-semibold text-foreground">{n}</span></div>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <section className="space-y-2 border-t pt-4"><h4 className="text-sm font-medium">Grupos</h4><Chips list={grupos} /></section>
            <section className="space-y-2"><h4 className="text-sm font-medium">Licenças</h4><Chips list={licencas} /></section>
            <section className="space-y-2">
              <h4 className="text-sm font-medium">Aplicações</h4>
              {apps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma.</p> : (
                <div className="grid grid-cols-4 gap-3">
                  {apps.slice(0, 8).map((a) => (
                    <div key={a.resource_key} className="flex flex-col items-center gap-1 text-center">
                      <ProductLogo nome={a.nome} />
                      <span className="line-clamp-2 text-[11px]">{a.nome}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
