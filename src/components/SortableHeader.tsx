import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

interface SortableHeaderProps {
  label: string;
  field: string;
  currentField: string | null;
  currentDirection: SortDirection;
  onSort: (field: string, direction: SortDirection) => void;
  className?: string;
}

export default function SortableHeader({ label, field, currentField, currentDirection, onSort, className = "" }: SortableHeaderProps) {
  const isActive = currentField === field;

  const handleClick = () => {
    if (!isActive) {
      onSort(field, "asc");
    } else if (currentDirection === "asc") {
      onSort(field, "desc");
    } else {
      onSort(field, null);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors select-none ${className}`}
    >
      {label}
      {isActive && currentDirection === "asc" && <ArrowUp className="h-3 w-3" />}
      {isActive && currentDirection === "desc" && <ArrowDown className="h-3 w-3" />}
      {!isActive && <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

export function useSortableData<T>(data: T[], sortField: string | null, sortDirection: SortDirection, getter?: (item: T, field: string) => any): T[] {
  if (!sortField || !sortDirection) return data;
  return [...data].sort((a, b) => {
    const aVal = getter ? getter(a, sortField) : (a as any)[sortField];
    const bVal = getter ? getter(b, sortField) : (b as any)[sortField];
    const aStr = (aVal ?? "").toString().toLowerCase();
    const bStr = (bVal ?? "").toString().toLowerCase();
    const cmp = aStr.localeCompare(bStr, "pt-BR");
    return sortDirection === "asc" ? cmp : -cmp;
  });
}
