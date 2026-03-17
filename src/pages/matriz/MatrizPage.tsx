import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";

const cargos = [
  "Analista de RH",
  "Gerente de TI",
  "Dev Junior",
  "Dev Pleno",
  "Dev Senior",
  "Tech Lead",
  "Coord. Financeiro",
  "Analista Financeiro",
  "Analista de Dados",
  "Estagiário TI",
];

const perfis = [
  { id: "1", nome: "Office 365" },
  { id: "2", nome: "Dev Full-Stack" },
  { id: "3", nome: "Admin Infra" },
  { id: "4", nome: "SAP Temp." },
  { id: "5", nome: "Financeiro" },
  { id: "6", nome: "Leitura BI" },
];

const apps = [
  { id: "1", nome: "Microsoft 365" },
  { id: "2", nome: "GitHub" },
  { id: "3", nome: "Jira" },
  { id: "4", nome: "SAP ERP" },
  { id: "5", nome: "Slack" },
  { id: "6", nome: "Datadog" },
];

// ●=automatico, ○=aprovacao, null=vazio
type CellValue = { type: "auto" | "aprovacao"; regraId: string; regraNome: string } | null;

const matrizPerfil: Record<string, Record<string, CellValue>> = {
  "Analista de RH": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null, "Admin Infra": null, "SAP Temp.": null, "Financeiro": null,
    "Leitura BI": null,
  },
  "Gerente de TI": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null,
    "Admin Infra": { type: "aprovacao", regraId: "2", regraNome: "Gerentes TI → Admin Infra" },
    "SAP Temp.": null, "Financeiro": null,
    "Leitura BI": { type: "auto", regraId: "6", regraNome: "Gerentes → BI" },
  },
  "Dev Junior": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": { type: "auto", regraId: "1", regraNome: "CLT Tecnologia → Dev Full-Stack" },
    "Admin Infra": null, "SAP Temp.": null, "Financeiro": null, "Leitura BI": null,
  },
  "Dev Pleno": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": { type: "auto", regraId: "1", regraNome: "CLT Tecnologia → Dev Full-Stack" },
    "Admin Infra": null, "SAP Temp.": null, "Financeiro": null, "Leitura BI": null,
  },
  "Dev Senior": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": { type: "auto", regraId: "1", regraNome: "CLT Tecnologia → Dev Full-Stack" },
    "Admin Infra": null, "SAP Temp.": null, "Financeiro": null, "Leitura BI": null,
  },
  "Tech Lead": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": { type: "auto", regraId: "1", regraNome: "CLT Tecnologia → Dev Full-Stack" },
    "Admin Infra": { type: "aprovacao", regraId: "2", regraNome: "Tech Lead → Dev + Infra" },
    "SAP Temp.": null, "Financeiro": null, "Leitura BI": null,
  },
  "Coord. Financeiro": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null, "Admin Infra": null, "SAP Temp.": null,
    "Financeiro": { type: "auto", regraId: "4", regraNome: "Financeiro → SAP + BI" },
    "Leitura BI": { type: "auto", regraId: "4", regraNome: "Financeiro → SAP + BI" },
  },
  "Analista Financeiro": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null, "Admin Infra": null, "SAP Temp.": null,
    "Financeiro": { type: "auto", regraId: "4", regraNome: "Financeiro → SAP + BI" },
    "Leitura BI": { type: "auto", regraId: "4", regraNome: "Financeiro → SAP + BI" },
  },
  "Analista de Dados": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null, "Admin Infra": null, "SAP Temp.": null, "Financeiro": null,
    "Leitura BI": { type: "auto", regraId: "6", regraNome: "Dados → Leitura BI" },
  },
  "Estagiário TI": {
    "Office 365": { type: "auto", regraId: "3", regraNome: "Todos CLT → Office Básico" },
    "Dev Full-Stack": null, "Admin Infra": null, "SAP Temp.": null, "Financeiro": null, "Leitura BI": null,
  },
};

function MatrizCell({ cell }: { cell: CellValue }) {
  if (!cell) return <span className="text-muted-foreground/30">—</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/regras/${cell.regraId}/editar`}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors hover:ring-2 hover:ring-ring ${
            cell.type === "auto"
              ? "bg-primary text-primary-foreground"
              : "border-2 border-warning bg-warning/15 text-warning"
          }`}
        >
          {cell.type === "auto" ? "●" : "○"}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">{cell.regraNome}</p>
        <p className="text-xs text-muted-foreground">
          {cell.type === "auto" ? "Execução automática" : "Requer aprovação"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function MatrizPage() {
  const columns = perfis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matriz Cargo × Acesso</h1>
          <p className="text-sm text-muted-foreground">Visualização consolidada derivada do motor de regras</p>
        </div>
        <Button variant="outline">
          <Download className="mr-1 h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="flex gap-4">
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo vínculo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="clt">CLT</SelectItem>
            <SelectItem value="terceiro">Terceiro</SelectItem>
            <SelectItem value="estagiario">Estagiário</SelectItem>
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="tecnologia">Tecnologia</SelectItem>
            <SelectItem value="financeiro">Financeiro</SelectItem>
            <SelectItem value="rh">Recursos Humanos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">●</span>
          Automático
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-warning bg-warning/15 text-[10px] font-bold text-warning">○</span>
          Sob aprovação
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/30">—</span>
          Sem acesso
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-card p-4 text-left font-medium text-muted-foreground min-w-[180px]">
                    Cargo
                  </th>
                  {columns.map((col) => (
                    <th key={col.id} className="p-4 text-center font-medium text-muted-foreground min-w-[100px]">
                      <span className="text-xs">{col.nome}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cargos.map((cargo) => (
                  <tr key={cargo} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="sticky left-0 z-10 bg-card p-4 font-medium">{cargo}</td>
                    {columns.map((col) => (
                      <td key={col.id} className="p-4 text-center">
                        <MatrizCell cell={matrizPerfil[cargo]?.[col.nome] ?? null} />
                      </td>
                    ))}
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
