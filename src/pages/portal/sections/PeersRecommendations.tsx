import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UsersRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface PeerResource {
  id: string;
  nome: string;
  tipo: "app" | "grupo" | "licenca";
  count: number;
  pctPeers: number;
}

interface Props {
  totalPeers: number;
  resources: PeerResource[];
  selected: { app: string[]; grupo: string[]; licenca: string[] };
  onAdd: (tipo: "app" | "grupo" | "licenca", id: string) => void;
  iconForTipo: Record<string, LucideIcon>;
}

export default function PeersRecommendations({ totalPeers, resources, selected, onAdd, iconForTipo }: Props) {
  if (totalPeers === 0 || resources.length === 0) return null;

  const top = resources.slice(0, 6);

  return (
    <Card className="border-info/30 bg-info/5">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-info" />
          <p className="text-sm font-medium">Colegas da sua área têm</p>
          <Badge variant="secondary" className="text-xs">{totalPeers} colega(s)</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {top.map((r) => {
            const Icon = iconForTipo[r.tipo] || UsersRound;
            const sel = selected[r.tipo].includes(r.id);
            return (
              <Button
                key={`${r.tipo}-${r.id}`}
                variant="outline"
                size="sm"
                disabled={sel}
                className="h-7 text-xs gap-1.5"
                onClick={() => onAdd(r.tipo, r.id)}
              >
                <Icon className="h-3 w-3" />
                {r.nome}
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{r.pctPeers}%</Badge>
                {!sel && <Plus className="h-3 w-3" />}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
