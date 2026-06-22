import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID")!;
  const clientId = Deno.env.get("AZURE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET")!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Graph token");
  return data.access_token;
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

  for (let i = 4; i < 12; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

async function resolveEntraUserId(token: string, email: string | null, sam: string | null): Promise<string | null> {
  const identifiers = [email, sam].filter(Boolean);
  for (const id of identifiers) {
    // Try by mail
    let res = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encodeURIComponent(id!)}'&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    let data = await res.json();
    if (data.value?.length > 0) return data.value[0].id;

    // Try by UPN
    res = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encodeURIComponent(id!)}'&$select=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    data = await res.json();
    if (data.value?.length > 0) return data.value[0].id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { colaborador_id } = await req.json();
    if (!colaborador_id) {
      return new Response(JSON.stringify({ error: "colaborador_id is required" }), { status: 400, headers: corsHeaders });
    }

    // Get collaborator data
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("id, nome, email, sam_account_name")
      .eq("id", colaborador_id)
      .single();

    if (!colab) {
      return new Response(JSON.stringify({ error: "Colaborador not found" }), { status: 404, headers: corsHeaders });
    }

    const token = await getGraphToken();
    const entraUserId = await resolveEntraUserId(token, colab.email, colab.sam_account_name);

    if (!entraUserId) {
      return new Response(JSON.stringify({ error: "User not found in Entra ID" }), { status: 404, headers: corsHeaders });
    }

    const tempPassword = generateTempPassword();

    // Reset password via Graph API
    const patchRes = await fetch(`https://graph.microsoft.com/v1.0/users/${entraUserId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passwordProfile: {
          password: tempPassword,
          forceChangePasswordNextSignIn: true,
        },
      }),
    });

    if (!patchRes.ok) {
      const errBody = await patchRes.text();
      console.error("[reset-entra-password] Graph API error:", errBody);
      return new Response(JSON.stringify({ error: "Failed to reset password", details: errBody }), { status: 500, headers: corsHeaders });
    }

    // Log audit
    await supabase.from("auditoria").insert({
      acao: "reset_senha_entra",
      entidade: "colaboradores",
      entidade_id: colaborador_id,
      resumo: `Senha resetada no Entra ID para ${colab.nome}`,
      operador: "sistema",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Senha temporária gerada para ${colab.nome}`,
        tempPassword,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[reset-entra-password] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
