import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) throw new Error("Missing Azure credentials");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default" }).toString(),
  });
  if (!res.ok) throw new Error(`Azure token error [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { colaborador_id, action } = await req.json();
    if (!colaborador_id) throw new Error("colaborador_id is required");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch the collaborator to get entra_id
    const { data: colab, error: colabErr } = await supabase
      .from("colaboradores")
      .select("id, nome, entra_id, status")
      .eq("id", colaborador_id)
      .single();
    if (colabErr || !colab) throw new Error("Colaborador não encontrado");

    const shouldDisable = action === "disable";
    const results: { entra_disabled: boolean; atribuicoes_revoked: number } = {
      entra_disabled: false,
      atribuicoes_revoked: 0,
    };

    // 1. Disable/enable in Entra ID (NEVER delete)
    if (colab.entra_id) {
      const token = await getAccessToken();
      const patchRes = await fetch(`https://graph.microsoft.com/v1.0/users/${colab.entra_id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountEnabled: !shouldDisable }),
      });
      if (!patchRes.ok) {
        const errText = await patchRes.text();
        throw new Error(`Graph API PATCH error [${patchRes.status}]: ${errText}`);
      }
      results.entra_disabled = shouldDisable;
    }

    // 2. Revoke all active perfil_atribuicoes for this collaborator
    if (shouldDisable) {
      const { data: revoked } = await supabase
        .from("perfil_atribuicoes")
        .update({ ativo: false, data_revogacao: new Date().toISOString() })
        .eq("colaborador_id", colaborador_id)
        .eq("ativo", true)
        .select("id");
      results.atribuicoes_revoked = revoked?.length ?? 0;
    }

    // 3. Log in auditoria
    await supabase.from("auditoria").insert({
      entidade: "colaborador",
      entidade_id: colaborador_id,
      acao: shouldDisable ? "desativar_entra" : "reativar_entra",
      resumo: shouldDisable
        ? `Usuário ${colab.nome} desativado no Entra ID. ${results.atribuicoes_revoked} acessos revogados.`
        : `Usuário ${colab.nome} reativado no Entra ID.`,
      operador: "sistema",
    });

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
