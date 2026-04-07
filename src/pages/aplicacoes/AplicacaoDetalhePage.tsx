import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle, ExternalLink, Globe, Cloud, Users, Shield, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function AplicacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading } = useQuery({
    queryKey: ["aplicacao", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("aplicacoes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Perfis that include this app
  const { data: perfisData } = useQuery({
    queryKey: ["aplicacao-perfis", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfil_aplicacoes")
        .select("perfil_id, perfis_acesso(id, nome, tipo, ativo)")
        .eq("aplicacao_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Colaboradores with this app via perfil_atribuicoes → perfis that include this app
  const { data: colaboradores } = useQuery({
    queryKey: ["aplicacao-colaboradores", id],
    queryFn: async () => {
      const perfilIds = (perfisData || []).map((p: any) => p.perfil_id);
      if (perfilIds.length === 0) return [];
      const { data, error } = await supabase
        .from("perfil_atribuicoes")
        .select("colaborador_id, perfil_id, colaboradores(id, nome, email, status, cargo_id, cargos(nome)), perfis_acesso(nome)")
        .in("perfil_id", perfilIds)
        .eq("ativo", true);
      if (error) throw error;
      return data;
    },
    enabled: !!perfisData && perfisData.length > 0,
  });

  // Grupos from perfis that include this app
  const { data: gruposData } = useQuery({
    queryKey: ["aplicacao-grupos", id],
    queryFn: async () => {
      const perfilIds = (perfisData || []).map((p: any) => p.perfil_id);
      if (perfilIds.length === 0) return [];
      const { data, error } = await supabase
        .from("perfil_grupos")
        .select("perfil_id, grupo_id, entra_grupos(nome, entra_id), perfis_acesso(nome)")
        .in("perfil_id", perfilIds);
      if (error) throw error;
      return data;
    },
    enabled: !!perfisData && perfisData.length > 0,
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  if (!app) {
    return <div className="text-center py-12"><p className="text-muted-foreground">Aplicação não encontrada</p></div>;
  }

  const perfis = (perfisData || []).map((p: any) => p.perfis_acesso).filter(Boolean);
  const colabList = (colaboradores || []).filter((c: any) => c.colaboradores);
  const grupos = (gruposData || []).filter((g: any) => g.entra_grupos);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/aplicacoes")} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />Voltar
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold">{app.nome}</h1>
                <Badge variant="outline" className={criticidadeColors[app.criticidade]}>{app.criticidade}</Badge>
                {(app as any).origem === "azure" ? (
                  <Badge variant="outline" className="bg-info/15 text-info border-info/30"><Cloud className="h-3 w-3 mr-1" />Azure SSO</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground"><Globe className="h-3 w-3 mr-1" />Manual</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {app.tipo_auth && <span><strong>Auth:</strong> {app.tipo_auth}</span>}
                {app.owner && <span><strong>Owner:</strong> {app.owner}</span>}
                {!app.owner && <span className="text-warning"><strong>Owner:</strong> Não definido</span>}
                {app.entra_id && <span><strong>Entra ID:</strong> <code className="text-xs bg-muted px-1 rounded">{app.entra_id}</code></span>}
              </div>
              <div className="flex gap-4">
                {app.aprovacao_necessaria && (
                  <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                    <CheckCircle className="h-3 w-3 mr-1" />Requer aprovação
                  </Badge>
                )}
                {app.integracao_ativa ? (
                  <Badge variant="outline" className="bg-success/15 text-success border-success/30">Integração ativa</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">Integração inativa</Badge>
                )}
              </div>
            </div>
            {(app as any).url && (
              <Button variant="outline" asChild>
                <a href={(app as any).url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />Acessar App
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios"><Users className="h-4 w-4 mr-1" />Usuários ({colabList.length})</TabsTrigger>
          <TabsTrigger value="perfis"><Shield className="h-4 w-4 mr-1" />Perfis ({perfis.length})</TabsTrigger>
          <TabsTrigger value="grupos"><Layers className="h-4 w-4 mr-1" />Grupos ({grupos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card><CardContent className="p-0">
            {colabList.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum usuário atribuído a esta aplicação</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">E-mail</th><th className="p-4 font-medium">Cargo</th><th className="p-4 font-medium">Perfil</th><th className="p-4 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {colabList.map((c: any, i: number) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/colaboradores/${c.colaboradores.id}`)}>
                        <td className="p-4 font-medium text-primary">{c.colaboradores.nome}</td>
                        <td className="p-4 text-muted-foreground">{c.colaboradores.email || "—"}</td>
                        <td className="p-4 text-muted-foreground">{c.colaboradores.cargos?.nome || "—"}</td>
                        <td className="p-4"><Badge variant="outline">{(c as any).perfis_acesso?.nome || "—"}</Badge></td>
                        <td className="p-4"><Badge variant={c.colaboradores.status === "ativo" ? "outline" : "destructive"} className={c.colaboradores.status === "ativo" ? "bg-success/15 text-success border-success/30" : ""}>{c.colaboradores.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="perfis">
          <Card><CardContent className="p-0">
            {perfis.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum perfil vinculado a esta aplicação</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome do Perfil</th><th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {perfis.map((p: any) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/perfis-acesso/${p.id}`)}>
                        <td className="p-4 font-medium text-primary">{p.nome}</td>
                        <td className="p-4"><Badge variant="outline">{p.tipo}</Badge></td>
                        <td className="p-4">{p.ativo ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativo</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativo</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="grupos">
          <Card><CardContent className="p-0">
            {grupos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum grupo vinculado a esta aplicação</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Grupo</th><th className="p-4 font-medium">Entra ID</th><th className="p-4 font-medium">Via Perfil</th>
                  </tr></thead>
                  <tbody>
                    {grupos.map((g: any, i: number) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4 font-medium">{g.entra_grupos.nome}</td>
                        <td className="p-4 text-muted-foreground"><code className="text-xs bg-muted px-1 rounded">{g.entra_grupos.entra_id}</code></td>
                        <td className="p-4"><Badge variant="outline">{(g as any).perfis_acesso?.nome || "—"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
