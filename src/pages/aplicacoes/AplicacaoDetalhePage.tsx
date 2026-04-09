import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ArrowLeft, CheckCircle, ExternalLink, Globe, Cloud, Users, Shield, Layers, Settings, Key, RefreshCw, Plus, Trash2, TestTube, ChevronsUpDown, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AppIcon from "@/components/AppIcon";
import EmptyState from "@/components/EmptyState";

const criticidadeColors: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/15 text-info border-info/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

const connectorTypeLabels: Record<string, string> = {
  manual: "Manual",
  entra: "Microsoft Entra ID",
  rest_api: "REST API",
  scim: "SCIM",
};

export default function AplicacaoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [ownerOpen, setOwnerOpen] = useState(false);

  const { data: app, isLoading } = useQuery({
    queryKey: ["aplicacao", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("aplicacoes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: perfisData } = useQuery({
    queryKey: ["aplicacao-perfis", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil_aplicacoes").select("perfil_id, perfis_acesso(id, nome, tipo, ativo)").eq("aplicacao_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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

  // Real users from iam_queue (assign_app completed for this app)
  const { data: iamAppUsers } = useQuery({
    queryKey: ["aplicacao-iam-users", id, app?.nome],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("iam_queue")
        .select("colaborador_id, target_identity, payload_json, created_at")
        .eq("action_type", "assign_app")
        .eq("status", "success");
      if (error) throw error;
      // Filter by app name or entra_id in payload
      return (data || []).filter((item: any) => {
        const p = item.payload_json;
        return p?.appName === app?.nome || p?.appId === app?.entra_id;
      });
    },
    enabled: !!app,
  });

  // Fetch collaborator details for iam_queue users
  const iamColabIds = [...new Set((iamAppUsers || []).map((i: any) => i.colaborador_id).filter(Boolean))];
  const { data: iamColabs } = useQuery({
    queryKey: ["iam-colabs", iamColabIds],
    queryFn: async () => {
      if (iamColabIds.length === 0) return [];
      const { data, error } = await supabase
        .from("colaboradores")
        .select("id, nome, email, status, cargo_id, cargos(nome)")
        .in("id", iamColabIds);
      if (error) throw error;
      return data;
    },
    enabled: iamColabIds.length > 0,
  });

  // Real groups from iam_queue (assign_group completed)
  const { data: iamGroupItems } = useQuery({
    queryKey: ["aplicacao-iam-groups", id, app?.nome],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("iam_queue")
        .select("colaborador_id, target_identity, payload_json, created_at")
        .eq("action_type", "assign_group")
        .eq("status", "success");
      if (error) throw error;
      return data || [];
    },
    enabled: !!app,
  });

  // All collaborators for owner select
  const { data: allColaboradores } = useQuery({
    queryKey: ["all-colaboradores-owner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select("id, nome, email")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Internal profiles for this app
  const { data: perfisInternos, refetch: refetchPerfisInternos } = useQuery({
    queryKey: ["aplicacao-perfis-internos", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("aplicacao_perfis_internos").select("*").eq("aplicacao_id", id!).order("nome_externo");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Connector config state
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connForm, setConnForm] = useState({
    connector_type: "manual",
    base_url: "",
    auth_type: "bearer",
    api_token: "",
    username: "",
    password: "",
    api_key_header: "",
    api_key_value: "",
    app_token: "",
    session_token: "",
    token_url: "",
    oauth_client_id: "",
    oauth_client_secret: "",
    oauth_scope: "",
    profiles_endpoint: "",
    create_user_endpoint: "",
    update_user_endpoint: "",
    disable_user_endpoint: "",
    delete_user_endpoint: "",
  });
  const [savingConn, setSavingConn] = useState(false);
  const [syncingProfiles, setSyncingProfiles] = useState(false);

  // Add internal profile manually
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [newProfile, setNewProfile] = useState({ nome_externo: "", external_id: "", descricao: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const openConnectorEdit = () => {
    const config = (app as any)?.connector_config || {};
    setConnForm({
      connector_type: (app as any)?.connector_type || "manual",
      base_url: config.base_url || "",
      auth_type: config.auth_type || "bearer",
      api_token: config.api_token || "",
      username: config.username || "",
      password: config.password || "",
      api_key_header: config.api_key_header || "",
      api_key_value: config.api_key_value || "",
      app_token: config.app_token || "",
      session_token: config.session_token || "",
      token_url: config.token_url || "",
      oauth_client_id: config.oauth_client_id || "",
      oauth_client_secret: config.oauth_client_secret || "",
      oauth_scope: config.oauth_scope || "",
      profiles_endpoint: config.profiles_endpoint || "",
      create_user_endpoint: config.create_user_endpoint || "",
      update_user_endpoint: config.update_user_endpoint || "",
      disable_user_endpoint: config.disable_user_endpoint || "",
      delete_user_endpoint: config.delete_user_endpoint || "",
    });
    setConnectorOpen(true);
  };

  const handleSaveConnector = async () => {
    setSavingConn(true);
    try {
      const connConfig: Record<string, any> = {
        base_url: connForm.base_url,
        auth_type: connForm.auth_type,
        profiles_endpoint: connForm.profiles_endpoint || undefined,
        create_user_endpoint: connForm.create_user_endpoint || undefined,
        update_user_endpoint: connForm.update_user_endpoint || undefined,
        disable_user_endpoint: connForm.disable_user_endpoint || undefined,
        delete_user_endpoint: connForm.delete_user_endpoint || undefined,
      };
      if (connForm.auth_type === "bearer") connConfig.api_token = connForm.api_token;
      if (connForm.auth_type === "basic") { connConfig.username = connForm.username; connConfig.password = connForm.password; }
      if (connForm.auth_type === "api_key") { connConfig.api_key_header = connForm.api_key_header; connConfig.api_key_value = connForm.api_key_value; }
      if (connForm.auth_type === "app_token") { connConfig.app_token = connForm.app_token; connConfig.session_token = connForm.session_token; }
      if (connForm.auth_type === "oauth2_client_credentials") {
        connConfig.token_url = connForm.token_url;
        connConfig.oauth_client_id = connForm.oauth_client_id;
        connConfig.oauth_client_secret = connForm.oauth_client_secret;
        connConfig.oauth_scope = connForm.oauth_scope || undefined;
      }

      const { error } = await supabase.from("aplicacoes").update({
        connector_type: connForm.connector_type as any,
        connector_config: connConfig as any,
      } as any).eq("id", id!);
      if (error) throw error;

      toast({ title: "Conector salvo com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["aplicacao", id] });
      setConnectorOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSavingConn(false);
  };

  const handleSyncProfiles = async () => {
    setSyncingProfiles(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-app-profiles`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ aplicacao_id: id }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Erro na sincronização", description: body.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        toast({ title: "Perfis sincronizados", description: `${body.total} perfis encontrados (${body.created} novos, ${body.updated} atualizados)` });
        refetchPerfisInternos();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSyncingProfiles(false);
  };

  const handleAddProfile = async () => {
    if (!newProfile.nome_externo.trim()) return;
    setSavingProfile(true);
    try {
      const { error } = await (supabase as any).from("aplicacao_perfis_internos").insert({
        aplicacao_id: id,
        nome_externo: newProfile.nome_externo.trim(),
        external_id: newProfile.external_id.trim() || null,
        descricao: newProfile.descricao.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Perfil interno adicionado" });
      setNewProfile({ nome_externo: "", external_id: "", descricao: "" });
      setAddProfileOpen(false);
      refetchPerfisInternos();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSavingProfile(false);
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      const { error } = await (supabase as any).from("aplicacao_perfis_internos").delete().eq("id", profileId);
      if (error) throw error;
      toast({ title: "Perfil interno removido" });
      refetchPerfisInternos();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateOwner = async (colab: { id: string; nome: string; email: string | null }) => {
    const ownerValue = colab.email ? `${colab.nome} <${colab.email}>` : colab.nome;
    const { error } = await supabase.from("aplicacoes").update({ owner: ownerValue } as any).eq("id", id!);
    if (error) {
      toast({ title: "Erro ao atualizar owner", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Owner atualizado" });
      queryClient.invalidateQueries({ queryKey: ["aplicacao", id] });
    }
    setOwnerOpen(false);
  };

  const handleClearOwner = async () => {
    const { error } = await supabase.from("aplicacoes").update({ owner: null } as any).eq("id", id!);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Owner removido" });
      queryClient.invalidateQueries({ queryKey: ["aplicacao", id] });
    }
    setOwnerOpen(false);
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  if (!app) {
    return <div className="text-center py-12"><p className="text-muted-foreground">Aplicação não encontrada</p></div>;
  }

  const perfis = (perfisData || []).map((p: any) => p.perfis_acesso).filter(Boolean);
  const colabList = (colaboradores || []).filter((c: any) => c.colaboradores);
  const grupos = (gruposData || []).filter((g: any) => g.entra_grupos);
  const connType = (app as any).connector_type || "manual";
  const hasConnector = connType !== "manual";

  // Merge profile-based users with iam_queue users (deduplicated)
  const profileColabIds = new Set(colabList.map((c: any) => c.colaboradores.id));
  const iamColabMap = new Map((iamColabs || []).map((c: any) => [c.id, c]));
  const extraIamUsers = (iamAppUsers || [])
    .filter((item: any) => item.colaborador_id && !profileColabIds.has(item.colaborador_id))
    .reduce((acc: Map<string, any>, item: any) => {
      if (!acc.has(item.colaborador_id)) acc.set(item.colaborador_id, item);
      return acc;
    }, new Map());

  const totalUsers = colabList.length + extraIamUsers.size;

  // Groups from iam_queue that match this app's perfil groups
  const perfilGrupoIds = new Set(grupos.map((g: any) => g.entra_grupos?.entra_id));
  const extraIamGroups = (iamGroupItems || [])
    .filter((item: any) => {
      const p = item.payload_json;
      return p?.groupId && !perfilGrupoIds.has(p.groupId);
    })
    .reduce((acc: Map<string, any>, item: any) => {
      const key = item.payload_json?.groupId;
      if (key && !acc.has(key)) acc.set(key, item);
      return acc;
    }, new Map());

  const totalGroups = grupos.length + extraIamGroups.size;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/aplicacoes")} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />Voltar
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <AppIcon url={app.url} origem={app.origem} size={32} />
                <h1 className="text-2xl font-semibold">{app.nome}</h1>
                <Badge variant="outline" className={criticidadeColors[app.criticidade]}>{app.criticidade.charAt(0).toUpperCase() + app.criticidade.slice(1)}</Badge>
                {(app as any).origem === "azure" ? (
                  <Badge variant="outline" className="bg-info/15 text-info border-info/30"><Cloud className="h-3 w-3 mr-1" />Azure SSO</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground"><Globe className="h-3 w-3 mr-1" />Manual</Badge>
                )}
                <Badge variant="outline" className={hasConnector ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}>
                  <Settings className="h-3 w-3 mr-1" />{connectorTypeLabels[connType] || connType}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground items-center">
                {app.tipo_auth && <span><strong>Auth:</strong> {app.tipo_auth}</span>}
                <div className="flex items-center gap-1">
                  <strong>Owner:</strong>
                  <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1 font-normal">
                        {app.owner ? (
                          <span className="truncate max-w-[200px]">{app.owner}</span>
                        ) : (
                          <span className="text-warning">Não definido</span>
                        )}
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar colaborador..." />
                        <CommandList>
                          <CommandEmpty>Nenhum colaborador encontrado</CommandEmpty>
                          <CommandGroup>
                            {app.owner && (
                              <CommandItem onSelect={handleClearOwner} className="text-destructive">
                                Remover owner
                              </CommandItem>
                            )}
                            {(allColaboradores || []).map((c: any) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.nome} ${c.email || ""}`}
                                onSelect={() => handleUpdateOwner(c)}
                              >
                                <div className="flex flex-col">
                                  <span>{c.nome}</span>
                                  {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {app.entra_id && <span><strong>Entra ID:</strong> <code className="text-xs bg-muted px-1 rounded">{app.entra_id}</code></span>}
              </div>
              <div className="flex gap-4 flex-wrap">
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
            <div className="flex gap-2 flex-wrap">
              {(app as any).url && (
                <Button variant="outline" asChild>
                  <a href={(app as any).url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />Acessar App
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="usuarios">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="usuarios"><Users className="h-4 w-4 mr-1" />Usuários ({totalUsers})</TabsTrigger>
          <TabsTrigger value="perfis"><Shield className="h-4 w-4 mr-1" />Perfis ({perfis.length})</TabsTrigger>
          <TabsTrigger value="grupos"><Layers className="h-4 w-4 mr-1" />Grupos ({totalGroups})</TabsTrigger>
          <TabsTrigger value="conector"><Settings className="h-4 w-4 mr-1" />Conector</TabsTrigger>
          <TabsTrigger value="perfis-internos"><Key className="h-4 w-4 mr-1" />Perfis Internos ({(perfisInternos || []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <Card><CardContent className="p-0">
            {totalUsers === 0 ? (
              <EmptyState message="Nenhum usuário atribuído a esta aplicação" size="lg" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium hidden sm:table-cell">E-mail</th><th className="p-4 font-medium hidden md:table-cell">Cargo</th><th className="p-4 font-medium">Origem</th><th className="p-4 font-medium hidden sm:table-cell">Status</th>
                  </tr></thead>
                  <tbody>
                    {colabList.map((c: any, i: number) => (
                      <tr key={`perfil-${i}`} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/colaboradores/${c.colaboradores.id}`)}>
                        <td className="p-4 font-medium text-primary">{c.colaboradores.nome}</td>
                        <td className="p-4 text-muted-foreground hidden sm:table-cell">{c.colaboradores.email || "—"}</td>
                        <td className="p-4 text-muted-foreground hidden md:table-cell">{c.colaboradores.cargos?.nome || "—"}</td>
                        <td className="p-4"><Badge variant="outline">{(c as any).perfis_acesso?.nome || "Perfil"}</Badge></td>
                        <td className="p-4 hidden sm:table-cell"><Badge variant={c.colaboradores.status === "ativo" ? "outline" : "destructive"} className={c.colaboradores.status === "ativo" ? "bg-success/15 text-success border-success/30" : ""}>{({ ativo: "Ativo", inativo: "Inativo", ferias: "Férias", afastado: "Afastado", desligado: "Desligado" } as Record<string, string>)[c.colaboradores.status] || c.colaboradores.status}</Badge></td>
                      </tr>
                    ))}
                    {[...extraIamUsers.values()].map((item: any) => {
                      const colab = iamColabMap.get(item.colaborador_id);
                      if (!colab) return null;
                      return (
                        <tr key={`iam-${item.colaborador_id}`} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/colaboradores/${colab.id}`)}>
                          <td className="p-4 font-medium text-primary">{colab.nome}</td>
                          <td className="p-4 text-muted-foreground hidden sm:table-cell">{colab.email || "—"}</td>
                          <td className="p-4 text-muted-foreground hidden md:table-cell">{colab.cargos?.nome || "—"}</td>
                          <td className="p-4"><Badge variant="secondary">Individual</Badge></td>
                          <td className="p-4 hidden sm:table-cell"><Badge variant={colab.status === "ativo" ? "outline" : "destructive"} className={colab.status === "ativo" ? "bg-success/15 text-success border-success/30" : ""}>{({ ativo: "Ativo", inativo: "Inativo", ferias: "Férias", afastado: "Afastado", desligado: "Desligado" } as Record<string, string>)[colab.status] || colab.status}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="perfis">
          <Card><CardContent className="p-0">
            {perfis.length === 0 ? (
              <EmptyState message="Nenhum perfil vinculado a esta aplicação" size="lg" />
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
                        <td className="p-4"><Badge variant="outline">{p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}</Badge></td>
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
            {totalGroups === 0 ? (
              <EmptyState message="Nenhum grupo vinculado a esta aplicação" size="lg" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Grupo</th><th className="p-4 font-medium hidden sm:table-cell">Entra ID</th><th className="p-4 font-medium">Origem</th>
                  </tr></thead>
                  <tbody>
                    {grupos.map((g: any, i: number) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4 font-medium">{g.entra_grupos.nome}</td>
                        <td className="p-4 text-muted-foreground hidden sm:table-cell"><code className="text-xs bg-muted px-1 rounded">{g.entra_grupos.entra_id}</code></td>
                        <td className="p-4"><Badge variant="outline">{(g as any).perfis_acesso?.nome || "Perfil"}</Badge></td>
                      </tr>
                    ))}
                    {[...extraIamGroups.values()].map((item: any) => (
                      <tr key={`iam-grp-${item.payload_json.group_id}`} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4 font-medium">{item.payload_json.group_name || item.payload_json.group_id}</td>
                        <td className="p-4 text-muted-foreground hidden sm:table-cell"><code className="text-xs bg-muted px-1 rounded">{item.payload_json.group_id}</code></td>
                        <td className="p-4"><Badge variant="secondary">Individual</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* Connector Tab */}
        <TabsContent value="conector">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Configuração do Conector</CardTitle>
                  <CardDescription>Configure como o sistema se conecta a esta aplicação externa para gerenciar usuários</CardDescription>
                </div>
                <Button onClick={openConnectorEdit}><Settings className="mr-2 h-4 w-4" />Configurar</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><strong>Tipo:</strong> {connectorTypeLabels[connType] || connType}</div>
                <div><strong>Auth:</strong> {(app as any).connector_config?.auth_type || "Não configurado"}</div>
                <div><strong>Base URL:</strong> {(app as any).connector_config?.base_url || "Não configurada"}</div>
                <div><strong>Endpoint Perfis:</strong> {(app as any).connector_config?.profiles_endpoint || "/profiles (padrão)"}</div>
              </div>
              {!hasConnector && (
                <div className="mt-4 p-3 rounded-md border border-info/30 bg-info/5 text-sm text-muted-foreground">
                  Esta aplicação não tem conector configurado. Clique em "Configurar" para integrar com a API do sistema externo (GLPI, SAP, etc.).
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Internal Profiles Tab */}
        <TabsContent value="perfis-internos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Perfis Internos da Aplicação</CardTitle>
                  <CardDescription>Roles/perfis disponíveis dentro desta aplicação (ex: Técnico, Admin, Leitura)</CardDescription>
                </div>
                <div className="flex gap-2">
                  {hasConnector && (
                    <Button variant="outline" size="sm" onClick={handleSyncProfiles} disabled={syncingProfiles}>
                      <RefreshCw className={`mr-1 h-3 w-3 ${syncingProfiles ? "animate-spin" : ""}`} />
                      {syncingProfiles ? "Sincronizando..." : "Sincronizar da API"}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => { setNewProfile({ nome_externo: "", external_id: "", descricao: "" }); setAddProfileOpen(true); }}>
                    <Plus className="mr-1 h-3 w-3" />Adicionar Manual
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(perfisInternos || []).length === 0 ? (
                <EmptyState message={`Nenhum perfil interno cadastrado. ${hasConnector ? "Clique em 'Sincronizar da API' ou adicione manualmente." : "Adicione manualmente."}`} size="lg" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground">
                      <th className="p-4 font-medium">Nome</th>
                      <th className="p-4 font-medium hidden sm:table-cell">ID Externo</th>
                      <th className="p-4 font-medium hidden md:table-cell">Descrição</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium w-10"></th>
                    </tr></thead>
                    <tbody>
                      {(perfisInternos || []).map((pi: any) => (
                        <tr key={pi.id} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="p-4 font-medium">{pi.nome_externo}</td>
                          <td className="p-4 text-muted-foreground hidden sm:table-cell"><code className="text-xs bg-muted px-1 rounded">{pi.external_id || "—"}</code></td>
                          <td className="p-4 text-muted-foreground hidden md:table-cell">{pi.descricao || "—"}</td>
                          <td className="p-4">{pi.ativo ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativo</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">Inativo</Badge>}</td>
                          <td className="p-4">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteProfile(pi.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Connector Config Dialog */}
      <Dialog open={connectorOpen} onOpenChange={setConnectorOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configurar Conector</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Conector</Label>
              <Select value={connForm.connector_type} onValueChange={v => setConnForm({ ...connForm, connector_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (sem integração)</SelectItem>
                  <SelectItem value="entra">Microsoft Entra ID</SelectItem>
                  <SelectItem value="rest_api">REST API</SelectItem>
                  <SelectItem value="scim">SCIM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(connForm.connector_type === "rest_api" || connForm.connector_type === "scim") && (
              <>
                <div className="space-y-2">
                  <Label>Base URL *</Label>
                  <Input placeholder="https://api.exemplo.com/v1" value={connForm.base_url} onChange={e => setConnForm({ ...connForm, base_url: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Autenticação</Label>
                  <Select value={connForm.auth_type} onValueChange={v => setConnForm({ ...connForm, auth_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="api_key">API Key (Header)</SelectItem>
                      <SelectItem value="app_token">App-Token (GLPI)</SelectItem>
                      <SelectItem value="oauth2_client_credentials">OAuth 2.0 (Client Credentials)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {connForm.auth_type === "bearer" && (
                  <div className="space-y-2"><Label>Token</Label><Input type="password" value={connForm.api_token} onChange={e => setConnForm({ ...connForm, api_token: e.target.value })} /></div>
                )}
                {connForm.auth_type === "basic" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2"><Label>Usuário</Label><Input value={connForm.username} onChange={e => setConnForm({ ...connForm, username: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Senha</Label><Input type="password" value={connForm.password} onChange={e => setConnForm({ ...connForm, password: e.target.value })} /></div>
                  </div>
                )}
                {connForm.auth_type === "api_key" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2"><Label>Header</Label><Input placeholder="X-API-Key" value={connForm.api_key_header} onChange={e => setConnForm({ ...connForm, api_key_header: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Valor</Label><Input type="password" value={connForm.api_key_value} onChange={e => setConnForm({ ...connForm, api_key_value: e.target.value })} /></div>
                  </div>
                )}
                {connForm.auth_type === "app_token" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2"><Label>App-Token</Label><Input type="password" value={connForm.app_token} onChange={e => setConnForm({ ...connForm, app_token: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Session-Token</Label><Input type="password" value={connForm.session_token} onChange={e => setConnForm({ ...connForm, session_token: e.target.value })} /></div>
                  </div>
                )}
                {connForm.auth_type === "oauth2_client_credentials" && (
                  <div className="space-y-3">
                    <div className="space-y-2"><Label>Token URL *</Label><Input placeholder="https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token" value={connForm.token_url} onChange={e => setConnForm({ ...connForm, token_url: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2"><Label>Client ID *</Label><Input value={connForm.oauth_client_id} onChange={e => setConnForm({ ...connForm, oauth_client_id: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Client Secret *</Label><Input type="password" value={connForm.oauth_client_secret} onChange={e => setConnForm({ ...connForm, oauth_client_secret: e.target.value })} /></div>
                    </div>
                    <div className="space-y-2"><Label>Scope (opcional)</Label><Input placeholder="https://api.exemplo.com/.default" value={connForm.oauth_scope} onChange={e => setConnForm({ ...connForm, oauth_scope: e.target.value })} /></div>
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Endpoints (opcional — valores padrão são usados se vazio)</p>
                  <div className="space-y-2"><Label className="text-xs">Listar Perfis</Label><Input placeholder="/profiles" value={connForm.profiles_endpoint} onChange={e => setConnForm({ ...connForm, profiles_endpoint: e.target.value })} /></div>
                  <div className="space-y-2"><Label className="text-xs">Criar Usuário</Label><Input placeholder="/users" value={connForm.create_user_endpoint} onChange={e => setConnForm({ ...connForm, create_user_endpoint: e.target.value })} /></div>
                  <div className="space-y-2"><Label className="text-xs">Atualizar Usuário</Label><Input placeholder="/users/{id}" value={connForm.update_user_endpoint} onChange={e => setConnForm({ ...connForm, update_user_endpoint: e.target.value })} /></div>
                  <div className="space-y-2"><Label className="text-xs">Desativar Usuário</Label><Input placeholder="/users/{id}" value={connForm.disable_user_endpoint} onChange={e => setConnForm({ ...connForm, disable_user_endpoint: e.target.value })} /></div>
                  <div className="space-y-2"><Label className="text-xs">Deletar Usuário</Label><Input placeholder="/users/{id}" value={connForm.delete_user_endpoint} onChange={e => setConnForm({ ...connForm, delete_user_endpoint: e.target.value })} /></div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectorOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveConnector} disabled={savingConn}>{savingConn ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Internal Profile Dialog */}
      <Dialog open={addProfileOpen} onOpenChange={setAddProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Perfil Interno</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome do Perfil *</Label><Input placeholder="Ex: Técnico, Admin, Leitura" value={newProfile.nome_externo} onChange={e => setNewProfile({ ...newProfile, nome_externo: e.target.value })} /></div>
            <div className="space-y-2"><Label>ID Externo</Label><Input placeholder="ID no sistema externo" value={newProfile.external_id} onChange={e => setNewProfile({ ...newProfile, external_id: e.target.value })} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input placeholder="Descrição do perfil" value={newProfile.descricao} onChange={e => setNewProfile({ ...newProfile, descricao: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProfileOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddProfile} disabled={savingProfile || !newProfile.nome_externo.trim()}>{savingProfile ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
