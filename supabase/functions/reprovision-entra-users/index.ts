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
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Azure token error [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { perfil_id, cargo_id } = await req.json();
    if (!perfil_id && !cargo_id) throw new Error("perfil_id or cargo_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Find affected collaborators with entra_id
    let colaboradorIds: string[] = [];

    if (perfil_id) {
      // All collaborators with active assignment to this profile
      const { data: atrib } = await supabase
        .from("perfil_atribuicoes")
        .select("colaborador_id")
        .eq("perfil_id", perfil_id)
        .eq("ativo", true);
      colaboradorIds = [...new Set((atrib ?? []).map((a: any) => a.colaborador_id).filter(Boolean))];
    }

    if (cargo_id) {
      // All collaborators with this cargo
      const { data: colabs } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("cargo_id", cargo_id);
      const cargoColabIds = (colabs ?? []).map((c: any) => c.id);
      colaboradorIds = [...new Set([...colaboradorIds, ...cargoColabIds])];
    }

    if (colaboradorIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_users: 0, processed: 0, errors: 0, message: "Nenhum colaborador afetado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter only those with entra_id
    const { data: colabsWithEntra } = await supabase
      .from("colaboradores")
      .select("id, nome, entra_id")
      .in("id", colaboradorIds)
      .not("entra_id", "is", null);

    const eligibleColabs = (colabsWithEntra ?? []).filter((c: any) => c.entra_id);

    if (eligibleColabs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total_users: colaboradorIds.length, processed: 0, errors: 0, message: "Nenhum colaborador com Entra ID" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAccessToken();
    const graphHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    let processed = 0;
    let errors = 0;

    for (const colab of eligibleColabs) {
      try {
        const entraId = colab.entra_id;

        // Get all active profile IDs for this collaborator
        const { data: allAtrib } = await supabase
          .from("perfil_atribuicoes")
          .select("perfil_id")
          .eq("colaborador_id", colab.id)
          .eq("ativo", true);
        const perfilIds = [...new Set((allAtrib ?? []).map((a: any) => a.perfil_id))];

        if (perfilIds.length === 0) { processed++; continue; }

        // Licenses
        const { data: perfilLicencas } = await supabase
          .from("perfil_licencas")
          .select("licenca_id, entra_licencas(sku_id)")
          .in("perfil_id", perfilIds);
        const skuIds = [...new Set((perfilLicencas ?? []).map((pl: any) => pl.entra_licencas?.sku_id).filter(Boolean))];

        if (skuIds.length > 0) {
          const assignRes = await fetch(`https://graph.microsoft.com/v1.0/users/${entraId}/assignLicense`, {
            method: "POST",
            headers: graphHeaders,
            body: JSON.stringify({
              addLicenses: skuIds.map((skuId: string) => ({ skuId, disabledPlans: [] })),
              removeLicenses: [],
            }),
          });
          if (!assignRes.ok) {
            const errText = await assignRes.text();
            // Ignore "already assigned" errors
            if (!errText.includes("already")) {
              await supabase.from("auditoria").insert({
                entidade: "colaborador", entidade_id: colab.id,
                acao: "erro_reprovision_licencas",
                resumo: `Erro licenças para ${colab.nome}: ${errText.substring(0, 200)}`,
                operador: "sistema",
              });
            }
          } else {
            await assignRes.text(); // consume body
          }
        }

        // Groups
        const { data: perfilGrupos } = await supabase
          .from("perfil_grupos")
          .select("grupo_id, entra_grupos(entra_id, nome)")
          .in("perfil_id", perfilIds);
        const grupos = [...new Map((perfilGrupos ?? [])
          .filter((pg: any) => pg.entra_grupos?.entra_id)
          .map((pg: any) => [pg.entra_grupos.entra_id, pg.entra_grupos])
        ).values()];

        for (const grupo of grupos) {
          const addRes = await fetch(
            `https://graph.microsoft.com/v1.0/groups/${(grupo as any).entra_id}/members/$ref`,
            {
              method: "POST",
              headers: graphHeaders,
              body: JSON.stringify({
                "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${entraId}`,
              }),
            }
          );
          if (!addRes.ok) {
            const errText = await addRes.text();
            if (!errText.includes("already exist")) {
              await supabase.from("auditoria").insert({
                entidade: "colaborador", entidade_id: colab.id,
                acao: "erro_reprovision_grupo",
                resumo: `Erro grupo ${(grupo as any).nome} para ${colab.nome}: ${errText.substring(0, 200)}`,
                operador: "sistema",
              });
            }
          } else {
            await addRes.text();
          }
        }

        // Apps
        const { data: perfilApps } = await supabase
          .from("perfil_aplicacoes")
          .select("aplicacao_id, aplicacoes(entra_id, nome)")
          .in("perfil_id", perfilIds);
        const apps = [...new Map((perfilApps ?? [])
          .filter((pa: any) => pa.aplicacoes?.entra_id)
          .map((pa: any) => [pa.aplicacoes.entra_id, pa.aplicacoes])
        ).values()];

        for (const app of apps) {
          try {
            const assignRes = await fetch(
              `https://graph.microsoft.com/v1.0/servicePrincipals/${(app as any).entra_id}/appRoleAssignments`,
              {
                method: "POST",
                headers: graphHeaders,
                body: JSON.stringify({
                  principalId: entraId,
                  resourceId: (app as any).entra_id,
                  appRoleId: "00000000-0000-0000-0000-000000000000",
                }),
              }
            );
            if (!assignRes.ok) {
              const errText = await assignRes.text();
              if (!errText.includes("already exist")) {
                await supabase.from("auditoria").insert({
                  entidade: "colaborador", entidade_id: colab.id,
                  acao: "erro_reprovision_app",
                  resumo: `Erro app ${(app as any).nome} para ${colab.nome}: ${errText.substring(0, 200)}`,
                  operador: "sistema",
                });
              }
            } else {
              await assignRes.text();
            }
          } catch (_) { /* ignore */ }
        }

        // Audit success
        await supabase.from("auditoria").insert({
          entidade: "colaborador", entidade_id: colab.id,
          acao: "reprovision_entra",
          resumo: `Reprovisionamento Entra ID para ${colab.nome}: ${skuIds.length} licença(s), ${grupos.length} grupo(s), ${apps.length} app(s).`,
          operador: "sistema",
        });

        processed++;
      } catch (err) {
        errors++;
        await supabase.from("auditoria").insert({
          entidade: "colaborador", entidade_id: colab.id,
          acao: "erro_reprovision_entra",
          resumo: `Erro reprovisionamento para ${colab.nome}: ${(err as Error).message?.substring(0, 200)}`,
          operador: "sistema",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total_users: eligibleColabs.length, processed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
