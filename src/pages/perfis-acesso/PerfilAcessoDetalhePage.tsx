import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil } from "lucide-react";
import { usePerfilAcesso, usePerfilComposicao, usePerfilAtribuicoes, useRegraResultados, useRegras } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const sensibilidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Normal", class: "bg-muted text-muted-foreground" },
  media: { label: "Sensível", class: "bg-warning/15 text-warning border-warning/30" },
  alta: { label: "Alto", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Privilegiado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
};

export default function PerfilAcessoDetalhePage() {
  const { id } = useParams();
  const { data: perfil, isLoading } = usePerfilAcesso(id);
  const { data: composicao } = usePerfilComposicao(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(id);

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!perfil) return <div className="p-8 text-center text-muted-foreground">Perfil não encontrado.</div>;

  const sens = sensibilidadeConfig[perfil.sensibilidade] || { label: perfil.sensibilidade, class: "" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/perfis-acesso"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
            <Badge variant="outline" className={sens.class}>{sens.label}</Badge>
            <Badge variant="outline">{perfil.tipo}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{perfil.descricao || "Sem descrição"}</p>
        </div>
        <Button variant="outline" size="sm"><Pencil className="mr-1 h-3 w-3" />Editar</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sensibilidade</p><p className="text-lg font-semibold">{sens.label}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Itens composição</p><p className="text-lg font-semibold">{composicao?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pessoas atribuídas</p><p className="text-lg font-semibold">{atribuicoes?.length ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="composicao">
        <TabsList>
          <TabsTrigger value="composicao">Composição ({composicao?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas Atribuídas ({atribuicoes?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="composicao" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Detalhe</th>
              </tr></thead>
              <tbody>
                {(composicao ?? []).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-4"><Badge variant="outline">{item.tipo}</Badge></td>
                    <td className="p-4 font-medium">{item.nome}</td>
                    <td className="p-4 text-muted-foreground">{item.detalhe || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pessoas" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Cargo</th><th className="p-4 font-medium">Área</th><th className="p-4 font-medium">Origem</th>
              </tr></thead>
              <tbody>
                {(atribuicoes ?? []).map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-4 font-medium text-primary">{(a.colaboradores as any)?.nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.cargos?.nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.areas?.nome || "—"}</td>
                    <td className="p-4"><Badge variant="outline" className={origemColors[a.origem || "manual"]}>{a.origem === "regra" ? "Regra" : a.origem === "excecao" ? "Exceção" : "Manual"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
