import { AlertTriangle, AppWindow, FileText, UserX, Users, type LucideIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEffectiveAccess } from "@/hooks/useOrigoData";

export interface ImpactItem { icon: LucideIcon; title: string; detail?: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  impacts?: ImpactItem[];
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

/** Confirmação padrão: alerta, título com o alvo, quadro "Impacto da ação" e ação à direita. */
export default function ConfirmImpactDialog({ open, onOpenChange, title, description, impacts, confirmLabel, confirmIcon: CIcon, cancelLabel = "Cancelar", onConfirm, destructive = true }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg gap-0 p-0">
        <AlertDialogHeader className="space-y-3 p-6 pb-4 text-left">
          <AlertTriangle className="h-9 w-9 text-warning" />
          <AlertDialogTitle className="text-xl">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {impacts && impacts.length > 0 && (
          <div className="mx-6 mb-5 rounded-lg bg-muted/60 p-4">
            <p className="mb-3 text-sm font-semibold">Impacto da ação</p>
            <ul className="space-y-3">
              {impacts.map((i) => (
                <li key={i.title} className="flex gap-3">
                  <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground/80" />
                  <div><p className="text-sm">{i.title}</p>{i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AlertDialogFooter className="flex-row justify-between border-t p-5 sm:justify-between">
          <AlertDialogCancel className="mt-0">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}>
            {CIcon && <CIcon className="mr-1.5 h-4 w-4" />}{confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Impactos reais do desligamento de uma pessoa, a partir dos acessos efetivos. */
export function useLeaverImpacts(colaboradorId?: string, terceiroId?: string): ImpactItem[] {
  const { data } = useEffectiveAccess(colaboradorId, terceiroId);
  const rows = data ?? [];
  const count = (re: RegExp) => new Set(rows.filter((r) => re.test(r.tipo ?? "")).map((r) => r.resource_key)).size;
  const g = count(/grup|group/i), l = count(/licen/i), a = count(/app|aplic/i);
  return [
    { icon: UserX, title: "Desativa a conta Entra ID / AD", detail: "A conta é desabilitada pelo Hermes." },
    { icon: Users, title: `Remove ${plural(g, "grupo", "grupos")}`, detail: "Sai de todos os grupos que participa." },
    { icon: FileText, title: `Remove ${plural(l, "licença", "licenças")}`, detail: "As licenças ficam livres para reutilização." },
    { icon: AppWindow, title: `Revoga ${plural(a, "aplicação", "aplicações")}`, detail: "O acesso às aplicações é retirado." },
  ];
}
