import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ShieldAlert } from "lucide-react";
import EmptyState from "@/components/EmptyState";

type AssignmentType = "permanente" | "elegivel" | "ativo_pim";

const typeBadge: Record<AssignmentType, { label: string; variant: any; className?: string }> = {
  permanente: { label: "Permanente", variant: "secondary" },
  elegivel: { label: "Elegível (PIM)", variant: "outline", className: "border-blue-300 text-blue-700" },
  ativo_pim: { label: "Ativo (PIM)", variant: "outline", className: "border-amber-300 text-amber-700" },
};

export default function PrivilegedRolesSection({ colaboradorId }: { colaboradorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["colab-priv-roles", colaboradorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entra_role_members")
        .select("id, assignment_type, start_at, end_at, directory_scope_id, entra_roles!inner(id, nome, descricao, is_privileged)")
        .eq("colaborador_id", colaboradorId);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Carregando funções...</CardContent></Card>;

  const rows = (data || []) as any[];
  if (rows.length === 0) {
    return <Card><CardContent className="py-6"><EmptyState message="Este colaborador não possui funções administrativas no Entra ID." /></CardContent></Card>;
  }

  const privCount = rows.filter((r) => r.entra_roles?.is_privileged).length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {rows.length} funç{rows.length === 1 ? "ão" : "ões"} no Entra ID
            {privCount > 0 && <span className="ml-2 text-amber-600 font-medium">• {privCount} privilegiada{privCount === 1 ? "" : "s"}</span>}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Função</TableHead>
              <TableHead>Privilegiado</TableHead>
              <TableHead>Tipo de atribuição</TableHead>
              <TableHead>Janela</TableHead>
              <TableHead>Escopo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const role = r.entra_roles;
              const t = typeBadge[(r.assignment_type || "permanente") as AssignmentType];
              const janela = r.end_at
                ? `até ${new Date(r.end_at).toLocaleDateString("pt-BR")}`
                : r.start_at
                ? `desde ${new Date(r.start_at).toLocaleDateString("pt-BR")}`
                : "—";
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {role?.is_privileged ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <Shield className="h-4 w-4 text-muted-foreground" />}
                      {role?.nome}
                    </div>
                  </TableCell>
                  <TableCell>
                    {role?.is_privileged ? <Badge className="bg-amber-100 text-amber-800 border-amber-300">Sim</Badge> : <Badge variant="outline">Não</Badge>}
                  </TableCell>
                  <TableCell><Badge variant={t.variant} className={t.className}>{t.label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{janela}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{r.directory_scope_id || "/"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
