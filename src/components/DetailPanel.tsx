import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Painel lateral de detalhes ao lado da lista; em telas estreitas fica por cima. */
export default function DetailPanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l bg-card p-5 shadow-lg xl:static xl:z-auto xl:w-[420px] xl:max-w-none xl:shrink-0 xl:self-start xl:rounded-xl xl:border xl:shadow-none">
      <Button variant="ghost" size="icon" className="float-right -mr-2 -mt-2 h-8 w-8" onClick={onClose} aria-label="Fechar">
        <X className="h-4 w-4" />
      </Button>
      {children}
    </aside>
  );
}

export function DetailField({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value || "—"}</p>
      </div>
    </div>
  );
}
