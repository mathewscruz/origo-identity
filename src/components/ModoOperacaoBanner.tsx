import { AlertTriangle } from "lucide-react";
import { useModoOperacao } from "@/hooks/useModoOperacao";

export default function ModoOperacaoBanner() {
  const { isSimulacao, isLoading } = useModoOperacao();
  if (isLoading || !isSimulacao) return null;
  return (
    <div className="flex items-center gap-2 bg-warning/15 border-b border-warning/30 px-4 py-2 text-sm font-medium text-warning">
      <AlertTriangle className="h-4 w-4" />
      Modo Simulação — as ações não serão executadas no AD/Entra ID
    </div>
  );
}
