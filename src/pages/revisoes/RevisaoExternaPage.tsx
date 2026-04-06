import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";

interface RevisaoItem {
  id: string;
  colaborador_nome: string | null;
  perfil_nome: string | null;
  decisao: string | null;
  colaborador_id: string | null;
  perfil_id: string | null;
}

export default function RevisaoExternaPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [revisao, setRevisao] = useState<any>(null);
  const [itens, setItens] = useState<RevisaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: rev, error: revErr } = await (supabase as any)
        .from("revisoes")
        .select("*, aplicacoes(nome)")
        .eq("token", token)
        .single();
      if (revErr || !rev) {
        setError("Revisão não encontrada ou token inválido.");
        setLoading(false);
        return;
      }
      setRevisao(rev);
      const { data: items } = await supabase
        .from("revisao_itens")
        .select("*")
        .eq("revisao_id", rev.id);
      setItens(items || []);
      const existing: Record<string, string> = {};
      (items || []).forEach((it: any) => { if (it.decisao) existing[it.id] = it.decisao; });
      setDecisions(existing);
      setLoading(false);
    })();
  }, [token]);

  const setDecision = (itemId: string, decisao: string) => {
    setDecisions((prev) => ({ ...prev, [itemId]: decisao }));
  };

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    let mantidos = 0;
    let revogados = 0;

    for (const item of itens) {
      const decisao = decisions[item.id];
      if (!decisao) continue;
      await supabase
        .from("revisao_itens")
        .update({ decisao, decidido_em: now })
        .eq("id", item.id);
      if (decisao === "manter") mantidos++;
      if (decisao === "revogar") revogados++;

      // Gerar iam_queue para revogações
      if (decisao === "revogar" && item.colaborador_id && item.perfil_id) {
        await supabase.from("perfil_atribuicoes").update({
          ativo: false,
          data_revogacao: now,
        }).eq("colaborador_id", item.colaborador_id).eq("perfil_id", item.perfil_id).eq("ativo", true);

        // Buscar sam_account_name do colaborador
        const { data: colab } = await (supabase as any).from("colaboradores").select("sam_account_name, nome, email").eq("id", item.colaborador_id).single();
        const sam = colab?.sam_account_name || "";
        if (sam) {
          // Buscar grupos do perfil revogado
          const { data: grupos } = await supabase.from("perfil_grupos").select("*, entra_grupos(nome, entra_id)").eq("perfil_id", item.perfil_id);
          for (const g of (grupos || [])) {
            await supabase.from("iam_queue" as any).insert({
              action_type: "remove_group",
              payload_json: { samAccountName: sam, displayName: colab?.nome || item.colaborador_nome || "", groupName: g.entra_grupos?.nome || "", groupEntraId: g.entra_grupos?.entra_id || "" },
              target_identity: sam, requested_by: revisao.owner_email || "revisao_externa", colaborador_id: item.colaborador_id, status: "pending",
            });
          }
          // Buscar licenças do perfil revogado
          const { data: licencas } = await supabase.from("perfil_licencas").select("*, entra_licencas(nome, sku_id)").eq("perfil_id", item.perfil_id);
          for (const l of (licencas || [])) {
            await supabase.from("iam_queue" as any).insert({
              action_type: "remove_license",
              payload_json: { samAccountName: sam, displayName: colab?.nome || item.colaborador_nome || "", licenseName: l.entra_licencas?.nome || "", skuId: l.entra_licencas?.sku_id || "" },
              target_identity: sam, requested_by: revisao.owner_email || "revisao_externa", colaborador_id: item.colaborador_id, status: "pending",
            });
          }
        }
      }
    }

    // Atualizar progresso da revisão
    const revisados = Object.keys(decisions).length;
    await supabase.from("revisoes").update({
      itens_revisados: revisados,
      status: revisados >= itens.length ? "concluida" : "em_andamento",
    }).eq("id", revisao.id);

    // Auditoria
    await supabase.from("auditoria").insert({
      entidade: "revisao",
      entidade_id: revisao.id,
      acao: "revisao_externa",
      operador: revisao.owner_email || "owner",
      resumo: `Revisão externa: ${mantidos} mantidos, ${revogados} revogados`,
      detalhes: { mantidos, revogados, total: itens.length, decisoes: decisions },
    });

    toast({ title: "Revisão salva com sucesso" });
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="flex items-center justify-center min-h-screen"><Card className="max-w-md"><CardContent className="pt-6 text-center"><p className="text-muted-foreground">{error}</p></CardContent></Card></div>;

  const appName = (revisao as any)?.aplicacoes?.nome || "Aplicação";
  const allDecided = itens.length > 0 && itens.every((it) => decisions[it.id]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Revisão de Acesso — {appName}</CardTitle>
            <CardDescription>
              Revise os acessos abaixo e decida manter ou revogar cada um. Ao finalizar, clique em "Salvar Revisão".
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Pessoa</th>
                  <th className="p-4 font-medium">Perfil</th>
                  <th className="p-4 font-medium text-center">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{it.colaborador_nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{it.perfil_nome || "—"}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant={decisions[it.id] === "manter" ? "default" : "outline"}
                          size="sm"
                          className={decisions[it.id] === "manter" ? "bg-success hover:bg-success/90 text-success-foreground" : ""}
                          onClick={() => setDecision(it.id, "manter")}
                        >
                          <Check className="h-3 w-3 mr-1" /> Manter
                        </Button>
                        <Button
                          variant={decisions[it.id] === "revogar" ? "destructive" : "outline"}
                          size="sm"
                          onClick={() => setDecision(it.id, "revogar")}
                        >
                          <X className="h-3 w-3 mr-1" /> Revogar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {Object.keys(decisions).length} de {itens.length} decididos
          </p>
          <Button onClick={handleSave} disabled={!allDecided || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Revisão
          </Button>
        </div>
      </div>
    </div>
  );
}
