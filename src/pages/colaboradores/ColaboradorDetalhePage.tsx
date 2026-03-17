import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, XCircle } from "lucide-react";
import { useColaborador, usePerfilAtribuicoes, useEventosJML } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
};

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};

export default function ColaboradorDetalhePage() {
  const { id } = useParams();
  const { data: pessoa, isLoading } = useColaborador(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(undefined, id);
  const { data: allEventos } = useEventosJML();

  const eventos = (allEventos ?? []).filter((e) => e.colaborador_id === id);

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!pessoa) return <div className="p-8 text-center text-muted-foreground">Colaborador não encontrado.</div>;

  const cargo = (pessoa.cargos as any)?.nome || "—";
  const area = (pessoa.areas as any)?.nome || "—";
  const empresa = (pessoa.empresas as any)?.nome || "—";
  const localidade = (pessoa.localidades as any)?.nome || "—";
  const gestor = (pessoa.gestor as any)?.nome || "—";
  const sc = statusConfig[pessoa.status] || { label: pessoa.status, class: "" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/colaboradores"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{pessoa.nome}</h1>
            <Badge variant="outline" className={sc.class}>{sc.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{cargo} · {area} · {empresa}</p>
        </div>
        <Button variant="outline" size="sm"><Pencil className="mr-1 h-3 w-3" /> Editar</Button>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="acessos">Acessos Ativos ({atribuicoes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="jml">Histórico JML ({eventos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome completo", pessoa.nome],
                  ["Email", pessoa.email || "—"],
                  ["CPF", pessoa.cpf || "—"],
                  ["Matrícula", pessoa.matricula || "—"],
                  ["Cargo", cargo],
                  ["Área", area],
                  ["Empresa", empresa],
                  ["Localidade", localidade],
                  ["Gestor", gestor],
                  ["Data admissão", pessoa.data_admissao ? new Date(pessoa.data_admissao).toLocaleDateString("pt-BR") : "—"],
                  ["Origem", pessoa.origem || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Aplicação</th>
                    <th className="p-4 font-medium">Perfil</th>
                    <th className="p-4 font-medium">Origem</th>
                    <th className="p-4 font-medium">Desde</th>
                    <th className="p-4 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(atribuicoes ?? []).map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-4 font-medium">{(a.perfis_acesso as any)?.aplicacoes?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{(a.perfis_acesso as any)?.nome || "—"}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={origemColors[a.origem || "manual"]}>
                          {a.origem === "regra" ? "Regra" : a.origem === "excecao" ? "Exceção" : "Manual"}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">{new Date(a.data_concessao).toLocaleDateString("pt-BR")}</td>
                      <td className="p-4">
                        <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive">
                          <XCircle className="mr-1 h-3 w-3" /> Revogar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!atribuicoes || atribuicoes.length === 0) && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum acesso ativo.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jml" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {eventos.length === 0 ? (
                <p className="text-center text-muted-foreground">Nenhum evento JML.</p>
              ) : (
                <div className="relative border-l-2 border-border pl-6 space-y-6">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card">
                        <div className={`h-2.5 w-2.5 rounded-full ${ev.tipo === "joiner" ? "bg-success" : ev.tipo === "mover" ? "bg-info" : "bg-destructive"}`} />
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${tipoJMLColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo}</Badge>
                            <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                          </div>
                          <p className="text-sm">
                            {ev.dados_depois ? JSON.stringify(ev.dados_depois) : ev.dados_antes ? JSON.stringify(ev.dados_antes) : "Evento processado"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-4">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
