import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton, type SkeletonVariant } from "@/components/LoadingSkeleton";
export default function QueryState({ loading, error, retry, children, variant = "table" }: { loading: boolean; error?: unknown; retry?: () => unknown; children: ReactNode; variant?: SkeletonVariant }) {
  if (error) return <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">Não foi possível carregar os dados. Nenhuma contagem foi confirmada.{retry && <Button variant="outline" size="sm" className="ml-3" onClick={() => retry()}>Tentar novamente</Button>}</div>;
  if (loading) return <LoadingSkeleton variant={variant} />;
  return <>{children}</>;
}
