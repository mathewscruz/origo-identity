import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, X, AppWindow, Users, KeyRound, AlertTriangle } from "lucide-react";

interface CartItem {
  id: string;
  tipo: "app" | "grupo" | "licenca";
  nome: string;
  conflict?: boolean;
}

interface Props {
  items: CartItem[];
  onRemove: (item: CartItem) => void;
  onClear: () => void;
  conflictCount: number;
}

const iconMap = { app: AppWindow, grupo: Users, licenca: KeyRound } as const;

export default function CartPanel({ items, onRemove, onClear, conflictCount }: Props) {
  return (
    <div className="sticky top-0 z-10 rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Carrinho</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
          {conflictCount > 0 && (
            <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">
              <AlertTriangle className="mr-1 h-3 w-3" />{conflictCount} conflito(s) SoD
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>Limpar</Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">Selecione recursos abaixo para adicioná-los ao carrinho.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 p-3 max-h-32 overflow-y-auto">
          {items.map((it) => {
            const Icon = iconMap[it.tipo];
            return (
              <Badge
                key={`${it.tipo}-${it.id}`}
                variant="outline"
                className={`text-xs gap-1 pr-1 ${it.conflict ? "border-destructive/40 text-destructive" : ""}`}
              >
                <Icon className="h-3 w-3" />
                {it.nome}
                <button
                  type="button"
                  onClick={() => onRemove(it)}
                  className="ml-1 hover:bg-muted rounded p-0.5"
                  aria-label={`Remover ${it.nome}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
