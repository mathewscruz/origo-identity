import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/EmptyState";

function useMatrizData() {
  return useQuery({
    queryKey: ["matriz_cargo_perfil"],
    queryFn: async () => {
      const [cargosRes, perfisRes, cpRes, regrasRes, condicoesRes, resultadosRes] = await Promise.all([
        supabase.from("cargos").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("perfis_acesso").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("cargo_perfis").select("cargo_id, perfil_id"),
        supabase.from("regras").select("id, nome").eq("status", "ativa"),
        supabase.from("regra_condicoes").select("regra_id, campo, valor"),
        supabase.from("regra_resultados").select("regra_id, perfil_id"),
      ]);

      const cargos = cargosRes.data ?? [];
      const perfis = perfisRes.data ?? [];
      const cargoPerfis = cpRes.data ?? [];
      const regras = regrasRes.data ?? [];
      const condicoes = condicoesRes.data ?? [];
      const resultados = resultadosRes.data ?? [];

      // Build cargo→perfil map from cargo_perfis (direct assignments)
      type CellValue = { type: "auto" | "regra"; regraId?: string; regraNome?: string };
      const matriz: Record<string, Record<string, CellValue>> = {};

      cargos.forEach(c => { matriz[c.id] = {}; });

      // Direct cargo_perfis assignments
      cargoPerfis.forEach(cp => {
        if (matriz[cp.cargo_id]) {
          matriz[cp.cargo_id][cp.perfil_id] = { type: "auto" };
        }
      });

      // Regras: find rules that match cargo_id condition and assign perfis
      const regraMap = new Map(regras.map(r => [r.id, r]));
      
      condicoes.forEach(cond => {
        if (cond.campo !== "cargo_id") return;
        const regra = regraMap.get(cond.regra_id);
        if (!regra) return;
        
        const regraResults = resultados.filter(r => r.regra_id === cond.regra_id);
        regraResults.forEach(res => {
          if (!res.perfil_id) return;
          if (matriz[cond.valor]) {
            matriz[cond.valor][res.perfil_id] = {
              type: "regra",
              regraId: regra.id,
              regraNome: regra.nome,
            };
          }
        });
      });

      // Filter to only show cargos and perfis that have at least one mapping
      const usedPerfilIds = new Set<string>();
      const usedCargoIds = new Set<string>();
      
      Object.entries(matriz).forEach(([cargoId, perfilMap]) => {
        Object.keys(perfilMap).forEach(perfilId => {
          usedPerfilIds.add(perfilId);
          usedCargoIds.add(cargoId);
        });
      });

      return {
        cargos: cargos,
        perfis: perfis,
        matriz,
        usedCargoIds,
        usedPerfilIds,
      };
    },
    staleTime: 30000,
  });
}

function MatrizCell({ cell }: { cell: { type: "auto" | "regra"; regraId?: string; regraNome?: string } | null }) {
  if (!cell) return <span className="text-muted-foreground/30">—</span>;

  const inner = (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors hover:ring-2 hover:ring-ring ${
        cell.type === "auto"
          ? "bg-primary text-primary-foreground"
          : "border-2 border-warning bg-warning/15 text-warning"
      }`}
    >
      {cell.type === "auto" ? "●" : "◆"}
    </span>
  );

  if (cell.type === "regra" && cell.regraId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to={`/regras/${cell.regraId}/editar`}>{inner}</Link>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="font-medium">{cell.regraNome}</p>
          <p className="text-xs text-muted-foreground">Via motor de regras</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs text-muted-foreground">Atribuição direta (cargo → perfil)</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function MatrizPage() {
  const { data, isLoading } = useMatrizData();

  const cargos = data?.cargos ?? [];
  const perfis = data?.perfis ?? [];
  const matriz = data?.matriz ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matriz Cargo × Acesso</h1>
          <p className="text-sm text-muted-foreground">
            Gerada automaticamente a partir das atribuições de cargo e motor de regras
          </p>
        </div>
        <Button variant="outline" disabled>
          <Download className="mr-1 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">●</span>
          Atribuição direta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-warning bg-warning/15 text-[10px] font-bold text-warning">◆</span>
          Via regra
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/30">—</span>
          Sem acesso
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cargos.length === 0 || perfis.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            Cadastre cargos e perfis de acesso para visualizar a matriz.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 bg-card p-4 text-left font-medium text-muted-foreground min-w-[180px]">
                      Cargo
                    </th>
                    {perfis.map((p) => (
                      <th key={p.id} className="p-4 text-center font-medium text-muted-foreground min-w-[100px]">
                        <Link to={`/perfis-acesso/${p.id}`} className="text-xs hover:text-primary hover:underline">
                          {p.nome}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cargos.map((cargo) => (
                    <tr key={cargo.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="sticky left-0 z-10 bg-card p-4 font-medium">{cargo.nome}</td>
                      {perfis.map((p) => (
                        <td key={p.id} className="p-4 text-center">
                          <MatrizCell cell={matriz[cargo.id]?.[p.id] ?? null} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
