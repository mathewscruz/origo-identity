import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Check, AlertTriangle } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import type { LucideIcon } from "lucide-react";

interface Resource {
  id: string;
  nome: string;
  [k: string]: any;
}

interface Props {
  icon: LucideIcon;
  label: string;
  itemLabel: string; // "selecionada(s)", "selecionado(s)"
  searchPlaceholder: string;
  emptyMessage: string;
  search: string;
  onSearchChange: (v: string) => void;
  items: Resource[];
  selected: string[];
  ownedIds: Set<string>;
  recommendedIds: Set<string>;
  /** Optional: resource IDs flagged as Segregation-of-Duties conflicts for this user. */
  conflictIds?: Set<string>;
  onToggle: (id: string) => void;
}

/**
 * Reusable catalog list for the Portal request dialog.
 * Renders a resource type (apps / groups / licenses) with:
 *  - Search box
 *  - Checkboxes with "Recomendado" / "Você já tem" / "Conflito SoD" badges
 *  - Disabled state for owned resources
 */
export default function CatalogResourceList({
  icon: Icon, label, itemLabel, searchPlaceholder, emptyMessage,
  search, onSearchChange, items, selected, ownedIds, recommendedIds, conflictIds, onToggle,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-4 w-4" /> {label}
        {selected.length > 0 && (
          <Badge variant="secondary" className="text-xs">{selected.length} {itemLabel}</Badge>
        )}
      </label>
      <Input placeholder={searchPlaceholder} value={search} onChange={(e) => onSearchChange(e.target.value)} />
      <ScrollArea className="h-36 rounded-md border p-2">
        {items.map((r) => {
          const owned = ownedIds.has(r.id);
          const recommended = recommendedIds.has(r.id);
          const conflict = conflictIds?.has(r.id) ?? false;
          return (
            <label key={r.id} className={`flex items-center gap-2 py-1.5 px-1 rounded cursor-pointer ${owned ? "opacity-60" : "hover:bg-muted/50"}`}>
              <Checkbox checked={selected.includes(r.id)} disabled={owned} onCheckedChange={() => onToggle(r.id)} />
              <span className="text-sm">{r.nome}</span>
              <div className="ml-auto flex items-center gap-1">
                {conflict && (
                  <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">
                    <AlertTriangle className="mr-1 h-2.5 w-2.5" />Conflito SoD
                  </Badge>
                )}
                {recommended && (
                  <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                    <Sparkles className="mr-1 h-2.5 w-2.5" />Recomendado
                  </Badge>
                )}
                {owned && (
                  <Badge variant="outline" className="text-xs border-success/40 text-success">
                    <Check className="mr-1 h-2.5 w-2.5" />Você já tem
                  </Badge>
                )}
              </div>
            </label>
          );
        })}
        {items.length === 0 && <EmptyState message={emptyMessage} size="sm" />}
      </ScrollArea>
    </div>
  );
}
