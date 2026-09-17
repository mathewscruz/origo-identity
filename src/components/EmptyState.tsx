import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import origoLogo from "@/assets/origo-logo.png";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** texto principal (compatível com o uso antigo) */
  message?: string;
  /** título opcional acima da mensagem */
  title?: string;
  /** ícone lucide; sem ícone usa a marca da Órigo */
  icon?: LucideIcon;
  /** ação (botão/link) abaixo do texto */
  action?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeConfig = {
  sm: { logo: 20, box: "h-7 w-7", icon: "h-3.5 w-3.5", text: "text-xs", title: "text-xs", gap: "gap-1.5", py: "py-2", row: true },
  md: { logo: 32, box: "h-10 w-10", icon: "h-5 w-5", text: "text-sm", title: "text-sm", gap: "gap-2", py: "py-8", row: false },
  lg: { logo: 44, box: "h-12 w-12", icon: "h-6 w-6", text: "text-sm", title: "text-base", gap: "gap-2.5", py: "py-12", row: false },
};

/** Estado vazio padrão: marca (ou ícone), título opcional, mensagem e ação. */
export default function EmptyState({ message = "Nenhum registro encontrado.", title, icon: Icon, action, size = "md", className }: EmptyStateProps) {
  const cfg = sizeConfig[size];
  const inline = cfg.row && !title && !action;

  return (
    <div className={cn("flex w-full items-center justify-center text-center", inline ? "flex-row" : "flex-col", cfg.gap, cfg.py, className)}>
      {Icon ? (
        <span className={cn("flex items-center justify-center rounded-full bg-muted text-muted-foreground", cfg.box)}><Icon className={cfg.icon} /></span>
      ) : (
        <img src={origoLogo} alt="" width={cfg.logo} height={cfg.logo} className="select-none opacity-30 grayscale" draggable={false} />
      )}
      <div className={cn("flex flex-col", inline ? "items-start" : "items-center")}>
        {title && <span className={cn("font-medium text-foreground", cfg.title)}>{title}</span>}
        <span className={cn("text-muted-foreground", cfg.text)}>{message}</span>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
