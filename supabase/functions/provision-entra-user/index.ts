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

function generateTempPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  let pwd = "";
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { colaborador_id } = await req.json();
    if (!colaborador_id) throw new Error("colaborador_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch collaborator
    const { data: colab, error: colabErr } = await supabase
      .from("colaboradores")
      .select("id, nome, email, entra_id, status")
      .eq("id", colaborador_id)
      .single();
    if (colabErr || !colab) throw new Error("Colaborador não encontrado");
    if (colab.entra_id) throw new Error("Colaborador já possui entra_id");
    if (!colab.email) throw new Error("Email é obrigatório para criar usuário no Entra ID");

    const token = await getAccessToken();
    const graphHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 2. Create user in Entra ID
    const mailNickname = colab.email.split("@")[0];
    const tempPassword = generateTempPassword();

    const createRes = await fetch("https://graph.microsoft.com/v1.0/users", {
      method: "POST",
      headers: graphHeaders,
      body: JSON.stringify({
        accountEnabled: true,
        displayName: colab.nome,
        mailNickname,
        userPrincipalName: colab.email,
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: tempPassword,
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Graph API create user error [${createRes.status}]: ${errText}`);
    }

    const entraUser = await createRes.json();
    const entraId = entraUser.id;

    // 3. Save entra_id on colaborador
    await supabase
      .from("colaboradores")
      .update({ entra_id: entraId })
      .eq("id", colaborador_id);

    // Log user creation
    await supabase.from("auditoria").insert({
      entidade: "colaborador",
      entidade_id: colaborador_id,
      acao: "criar_entra_id",
      resumo: `Usuário ${colab.nome} criado no Entra ID (${entraId}).`,
      operador: "sistema",
    });

    // 4. Get active profile assignments for this collaborator
    const { data: atribuicoes } = await supabase
      .from("perfil_atribuicoes")
      .select("perfil_id")
      .eq("colaborador_id", colaborador_id)
      .eq("ativo", true);

    const perfilIds = (atribuicoes ?? []).map((a: any) => a.perfil_id);
    let licensesAssigned = 0;
    let groupsAdded = 0;

    if (perfilIds.length > 0) {
      // 5. Get licenses linked to these profiles
      const { data: perfilLicencas } = await supabase
        .from("perfil_licencas")
        .select("licenca_id, entra_licencas(sku_id, nome)")
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

        if (assignRes.ok) {
          licensesAssigned = skuIds.length;
          await supabase.from("auditoria").insert({
            entidade: "colaborador",
            entidade_id: colaborador_id,
            acao: "atribuir_licencas_entra",
            resumo: `${licensesAssigned} licença(s) atribuída(s) ao usuário ${colab.nome} no Entra ID.`,
            operador: "sistema",
          });
        } else {
          const errText = await assignRes.text();
          await supabase.from("auditoria").insert({
            entidade: "colaborador",
            entidade_id: colaborador_id,
            acao: "erro_licencas_entra",
            resumo: `Erro ao atribuir licenças: ${errText.substring(0, 200)}`,
            operador: "sistema",
          });
        }
      }

      // 6. Get groups linked to these profiles
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
        if (addRes.ok || addRes.status === 204) {
          groupsAdded++;
        } else {
          const errText = await addRes.text();
          // 400 with "already exists" is OK
          if (errText.includes("already exist")) {
            groupsAdded++;
          } else {
            await supabase.from("auditoria").insert({
              entidade: "colaborador",
              entidade_id: colaborador_id,
              acao: "erro_grupo_entra",
              resumo: `Erro ao adicionar ao grupo ${(grupo as any).nome}: ${errText.substring(0, 200)}`,
              operador: "sistema",
            });
          }
        }
      }

      if (groupsAdded > 0) {
        await supabase.from("auditoria").insert({
          entidade: "colaborador",
          entidade_id: colaborador_id,
          acao: "adicionar_grupos_entra",
          resumo: `${groupsAdded} grupo(s) atribuído(s) ao usuário ${colab.nome} no Entra ID.`,
          operador: "sistema",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        entra_id: entraId,
        temp_password: tempPassword,
        licenses_assigned: licensesAssigned,
        groups_added: groupsAdded,
      }),
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
