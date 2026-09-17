import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

/**
 * Adaptador: mantém a API `toast({ title, description, variant })` das páginas,
 * mas tudo renderiza no Sonner (um único sistema de toasts, com cores por tipo,
 * botão de fechar e empilhamento). `variant: "destructive"` → erro; `success` →
 * sucesso; `warning` → aviso; padrão → informativo.
 */
export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive" | "success" | "warning";
  /** ms; padrão 4s (erros 6s) */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export function toast(opts: ToastOptions) {
  const message = opts.title ?? opts.description ?? "";
  const description = opts.title ? opts.description : undefined;
  const base = {
    description,
    duration: opts.duration ?? (opts.variant === "destructive" ? 6000 : 4000),
    action: opts.action ? { label: opts.action.label, onClick: opts.action.onClick } : undefined,
  };
  switch (opts.variant) {
    case "destructive": return sonner.error(message, base);
    case "success": return sonner.success(message, base);
    case "warning": return sonner.warning(message, base);
    default: return sonner(message, base);
  }
}

toast.success = (title: ReactNode, description?: ReactNode) => toast({ title, description, variant: "success" });
toast.error = (title: ReactNode, description?: ReactNode) => toast({ title, description, variant: "destructive" });
toast.warning = (title: ReactNode, description?: ReactNode) => toast({ title, description, variant: "warning" });
toast.dismiss = (id?: string | number) => sonner.dismiss(id);

export function useToast() {
  return { toast, dismiss: sonner.dismiss };
}
