import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useColaboradores } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

export default function ColaboradoresPage() {
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [areaFilter, setAreaFilter] = useState("todos");

  const { data: colaboradores, isLoading } = useColaboradores();

  const mapped = (colaboradores ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    email: c.email || "",
    cpf: c.cpf ? `***${c.cpf.slice(-6)}` : "—",
    cargo: (c.cargos as any)?.nome || "—",
    area: (c.areas as any)?.nome || "—",
    status: c.status,
  }));

  const filtered = mapped.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.email.toLowerCase().includes(busca.toLowerCase())) return false;
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (areaFilter !== "todos" && c.area !== areaFilter) return false;
    if (cargoFilter !== "todos" && c.cargo !== cargoFilter) return false;
    return true;
  });

  const areas = [...new Set(mapped.map((c) => c.area).filter((a) => a !== "—"))];
  const cargos = [...new Set(mapped.map((c) => c.cargo).filter((c) => c !== "—"))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Gestão de funcionários internos — fonte 2Easy</p>
        </div>
        <Button><Upload className="mr-1 h-4 w-4" />Importar Base</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar nome ou email..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
            <SelectItem value="ferias">Férias</SelectItem>
            <SelectItem value="afastado">Afastado</SelectItem>
            <SelectItem value="desligado">Desligado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas áreas</SelectItem>
            {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cargoFilter} onValueChange={setCargoFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos cargos</SelectItem>
            {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Email</th>
                    <th className="p-4 font-medium">CPF</th>
                    <th className="p-4 font-medium">Cargo</th>
                    <th className="p-4 font-medium">Área</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4">
                        <Link to={`/colaboradores/${c.id}`} className="font-medium text-primary hover:underline">{c.nome}</Link>
                      </td>
                      <td className="p-4 text-muted-foreground">{c.email}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{c.cpf}</td>
                      <td className="p-4 text-muted-foreground">{c.cargo}</td>
                      <td className="p-4 text-muted-foreground">{c.area}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusConfig[c.status]?.class || ""}>
                          {statusConfig[c.status]?.label || c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum colaborador encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="text-sm text-muted-foreground">{filtered.length} de {mapped.length} colaboradores</div>
    </div>
  );
}
