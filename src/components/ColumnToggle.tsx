import { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ToggleColumn = { key: string; label: string; index: number };

/** Colunas ocultáveis por tabela, salvas no navegador. */
export function useColumnVisibility(tableId: string, columns: ToggleColumn[]) {
  const storageKey = `cols:${tableId}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const toggle = (key: string) => setHidden((prev) => {
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  const css = columns
    .filter((c) => hidden.includes(c.key))
    .map((c) => `table[data-cols="${tableId}"] tr > :nth-child(${c.index}){display:none !important}`)
    .join("\n");
  const styleTag = css ? <style>{css}</style> : null;
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5"><Columns3 className="h-4 w-4" />Colunas</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuCheckboxItem key={c.key} checked={!hidden.includes(c.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle(c.key)}>
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return { menu, styleTag, hidden };
}
