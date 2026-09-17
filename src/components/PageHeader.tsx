import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** conteúdo à esquerda do título (ex.: botão voltar) */
  leading?: ReactNode;
  className?: string;
}

/** Cabeçalho padrão das páginas: título, descrição e ações alinhadas. */
export default function PageHeader({ title, description, icon: Icon, actions, leading, className = "" }: Props) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        {Icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
