import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// High-risk roleTemplateIds that should be marked as privileged
const PRIVILEGED_TEMPLATE_IDS = new Set([
  "62e90394-69f5-4237-9190-012177145e10", // Global Administrator
  "e8611ab8-c189-46e8-94e1-60213ab1f814", // Privileged Role Administrator
  "194ae4cb-b126-40b2-bd5b-6091b380977d", // Security Administrator
  "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", // SharePoint Administrator
  "29232cdf-9323-42fd-ade2-1d097af3e4de", // Exchange Administrator
  "fe930be7-5e62-47db-91af-98c3a49a38b1", // User Administrator
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", // Application Administrator
  "158c047a-c907-4556-b7ef-446551a6b5f7", // Cloud Application Administrator
  "b0f54661-2d74-4c50-afa3-1ec803f12efe", // Billing Administrator
  "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", // Conditional Access Administrator
  "729827e3-9c14-49f7-bb1b-9608f156bbb8", // Helpdesk Administrator
  "966707d0-3269-4727-9be2-8c3a10f19b9d", // Password Administrator
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", // Privileged Authentication Administrator
  "e6d1a23a-da11-4be4-9570-befc86d067a7", // Compliance Administrator
  "44367163-eba1-44c3-98af-f5787879f96a", // Dynamics 365 Administrator
  "11648597-926c-4cf3-9c36-bcebb0ba8dcc", // Power Platform Administrator
  "fdd7a751-b60b-444a-984c-02652fe8fa1c", // Groups Administrator
  "3a2c62db-5318-420d-8d74-23affee5d9d5", // Intune Administrator
  "69091246-20e8-4a56-aa4d-066075b2a7a8", // Teams Administrator
]);

async function getAzureToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) throw new Error("Azure credentials not configured");

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function graphGet(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function graphGetAll(token: string, url: string) {
  const items: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const data = await graphGet(token, nextUrl);
    items.push(...(data.value || []));
    nextUrl = data["@odata.nextLink"] || null;
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const token = await getAzureToken();

    // 1. Get all activated directory roles
    const roles = await graphGetAll(token, "https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId");

    // 2. Also get all role definitions for built-in info
    const roleDefs = await graphGetAll(token, "https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions?$select=id,displayName,description,isBuiltIn,templateId");
    const defMap = new Map(roleDefs.map((d: any) => [d.templateId || d.id, d]));

    // 3. Get all colaboradores for matching
    const { data: colabs } = await sb.from("colaboradores").select("id, entra_id, email").eq("status", "ativo");
    const entraMap = new Map((colabs || []).filter((c: any) => c.entra_id).map((c: any) => [c.entra_id, c.id]));
    const emailMap = new Map((colabs || []).filter((c: any) => c.email).map((c: any) => [c.email.toLowerCase(), c.id]));

    let totalMembers = 0;
    let alertsGenerated = 0;

    for (const role of roles) {
      const templateId = role.roleTemplateId || "";
      const def = defMap.get(templateId);
      const isPrivileged = PRIVILEGED_TEMPLATE_IDS.has(templateId);

      // Upsert role
      await sb.from("entra_roles" as any).upsert({
        role_id: role.id,
        nome: role.displayName || "Unknown",
        descricao: role.description || def?.description || null,
        is_privileged: isPrivileged,
        is_built_in: def?.isBuiltIn ?? true,
        template_id: templateId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "role_id" });

      // Get role's internal ID in our DB
      const { data: dbRole } = await sb.from("entra_roles" as any).select("id").eq("role_id", role.id).single();
      if (!dbRole) continue;

      // Get members
      const members = await graphGetAll(token, `https://graph.microsoft.com/v1.0/directoryRoles/${role.id}/members?$select=id,displayName,mail,userPrincipalName`);

      // Delete old members for this role, then insert new
      await sb.from("entra_role_members" as any).delete().eq("role_id", dbRole.id);

      for (const member of members) {
        const userEntraId = member.id;
        const email = (member.mail || member.userPrincipalName || "").toLowerCase();
        const colaboradorId = entraMap.get(userEntraId) || emailMap.get(email) || null;

        await sb.from("entra_role_members" as any).insert({
          role_id: dbRole.id,
          user_entra_id: userEntraId,
          user_display_name: member.displayName || null,
          user_email: email || null,
          colaborador_id: colaboradorId,
          updated_at: new Date().toISOString(),
        });
        totalMembers++;

        // Alert: privileged member not linked to active colaborador
        if (isPrivileged && !colaboradorId) {
          await sb.from("alertas" as any).insert({
            titulo: `Membro privilegiado não vinculado: ${member.displayName}`,
            mensagem: `O usuário "${member.displayName}" (${email}) possui a role privilegiada "${role.displayName}" mas não está vinculado a nenhum colaborador ativo no sistema.`,
            severidade: "aviso",
            tipo: "privilegiado_nao_vinculado",
            ref_tipo: "entra_role",
            ref_id: dbRole.id,
          });
          alertsGenerated++;
        }
      }

      // Alert: privileged role with too many members
      if (isPrivileged && members.length > 3) {
        await sb.from("alertas" as any).insert({
          titulo: `Role privilegiada com ${members.length} membros: ${role.displayName}`,
          mensagem: `A role "${role.displayName}" possui ${members.length} membros atribuídos, o que excede o limite recomendado de 3 para roles privilegiadas.`,
          severidade: "critico",
          tipo: "privilegiado_excesso",
          ref_tipo: "entra_role",
          ref_id: dbRole.id,
        });
        alertsGenerated++;
      }
    }

    // Audit log
    await sb.from("auditoria" as any).insert({
      acao: "sync",
      entidade: "entra_roles",
      resumo: `Sincronização de roles: ${roles.length} roles, ${totalMembers} membros, ${alertsGenerated} alertas`,
      operador: "sistema",
    });

    return new Response(JSON.stringify({
      success: true,
      roles: roles.length,
      members: totalMembers,
      alerts: alertsGenerated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("sync-entra-roles error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
