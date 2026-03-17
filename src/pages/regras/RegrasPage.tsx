import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Copy, Play, Power } from "lucide-react";
import { Link } from "react-router-dom";

const mockRegras = [
  {
    id: "1", nome: "CLT Tecnologia → Dev Full-Stack", prioridade: 10,
    condicoes: "cargo ∈ [Dev Junior, Dev Pleno, Dev Senior] AND área = Tecnologia",
    resultados: "Conceder: Desenvolvedor Full-Stack",
    modo: "automatico", vigencia: "01/01/2026 – ∞", ativo: true, conflitos: 0,
  },
  {
    id: "2", nome: "Tech Lead → Dev + Infra", prioridade: 5,
    condicoes: "cargo = Tech Lead AND área = Tecnologia",
    resultados: "Conceder: Dev Full-Stack + Admin Infra",
    modo: "aprovacao_manual", vigencia: "01/01/2026 – ∞", ativo: true, conflitos: 1,
  },
  {
    id: "3", nome: "Todos CLT → Office Básico", prioridade: 100,
    condicoes: "tipo_vínculo = CLT AND status = ativo",
    resultados: "Conceder: Acesso Básico Office 365",
    modo: "automatico", vigencia: "01/01/2026 – ∞", ativo: true, conflitos: 0,
  },
  {
    id: "4", nome: "Financeiro → SAP + BI", prioridade: 20,
    condicoes: "área = Financeiro",
    resultados: "Conceder: Analista Financeiro + Leitura BI",
    modo: "automatico", vigencia: "01/03/2026 – 31/12/2026", ativo: true, conflitos: 0,
  },
  {
    id: "5", nome: "Terceiro Crítico → Aprovação Owner", prioridade: 1,
    condicoes: "tipo_vínculo = terceiro AND criticidade = critica",
    resultados: "Exigir aprovação: Owner App + Admin IAM",
    modo: "aprovacao_manual", vigencia: "01/01/2026 – ∞", ativo: false, conflitos: 0,
  },
];

export default function RegrasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Motor de Regras</h1>
          <p className="text-sm text-muted-foreground">Regras multi-critério com prioridade, conflito e simulação</p>
        </div>
        <Button asChild>
          <Link to="/regras/nova">
            <Plus className="mr-1 h-4 w-4" />
            Nova Regra
          </Link>
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar regras..." className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Nome</th>
                  <th className="p-4 font-medium">Prioridade</th>
                  <th className="p-4 font-medium">Condições</th>
                  <th className="p-4 font-medium">Resultados</th>
                  <th className="p-4 font-medium">Modo</th>
                  <th className="p-4 font-medium">Vigência</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Conflitos</th>
                  <th className="p-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {mockRegras.map((regra) => (
                  <tr key={regra.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4">
                      <Link to={`/regras/${regra.id}/editar`} className="font-medium text-primary hover:underline">
                        {regra.nome}
                      </Link>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{regra.prioridade}</Badge>
                    </td>
                    <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{regra.condicoes}</td>
                    <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{regra.resultados}</td>
                    <td className="p-4">
                      <Badge variant="outline" className={
                        regra.modo === "automatico"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-warning/15 text-warning border-warning/30"
                      }>
                        {regra.modo === "automatico" ? "Auto" : "Aprovação"}
                      </Badge>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">{regra.vigencia}</td>
                    <td className="p-4">
                      <Badge variant={regra.ativo ? "default" : "secondary"}>
                        {regra.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {regra.conflitos > 0 ? (
                        <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                          {regra.conflitos}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Simular">
                          <Play className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicar">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Desativar">
                          <Power className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
