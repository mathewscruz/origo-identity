import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/auth.ts";

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

  const auth = await requireRole(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const token = await getAzureToken();
    console.log("Token acquired, fetching roles...");

    // 1. Get all activated directory roles
    const roles = await graphGetAll(token, "https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId");
    console.log(`Fetched ${roles.length} roles`);

    // 2. Also get all role definitions for built-in info
    const roleDefs = await graphGetAll(token, "https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions?$select=id,displayName,description,isBuiltIn,templateId");
    const defMap = new Map(roleDefs.map((d: any) => [d.templateId || d.id, d]));

    // 3. Get all colaboradores for matching
    const { data: colabs } = await sb.from("colaboradores").select("id, entra_id, email").eq("status", "ativo");
    const entraMap = new Map((colabs || []).filter((c: any) => c.entra_id).map((c: any) => [c.entra_id, c.id]));
    const emailMap = new Map((colabs || []).filter((c: any) => c.email).map((c: any) => [c.email.toLowerCase(), c.id]));

    // 4. Upsert all roles in batch
    const roleUpserts = roles.map((role) => {
      const templateId = role.roleTemplateId || "";
      const def = defMap.get(templateId);
      return {
        role_id: role.id,
        nome: role.displayName || "Unknown",
        descricao: role.description || def?.description || null,
        is_privileged: PRIVILEGED_TEMPLATE_IDS.has(templateId),
        is_built_in: def?.isBuiltIn ?? true,
        template_id: templateId,
        updated_at: new Date().toISOString(),
      };
    });

    // Batch upsert roles (chunks of 500)
    for (let i = 0; i < roleUpserts.length; i += 500) {
      await sb.from("entra_roles" as any).upsert(roleUpserts.slice(i, i + 500), { onConflict: "role_id" });
    }
    console.log("Roles upserted");

    // 5. Get all DB roles for ID mapping
    const { data: dbRoles } = await sb.from("entra_roles" as any).select("id, role_id");
    const dbRoleMap = new Map((dbRoles || []).map((r: any) => [r.role_id, r.id]));

    let totalMembers = 0;
    let alertsGenerated = 0;
    const allMemberInserts: any[] = [];
    const alertInserts: any[] = [];
    const roleIdsToClean: string[] = [];

    // 6. Fetch all members in parallel (batches of 5 concurrent)
    const CONCURRENCY = 5;
    for (let i = 0; i < roles.length; i += CONCURRENCY) {
      const batch = roles.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (role) => {
          const members = await graphGetAll(token, `https://graph.microsoft.com/v1.0/directoryRoles/${role.id}/members?$select=id,displayName,mail,userPrincipalName`);
          return { role, members };
        })
      );

      for (const { role, members } of results) {
        const dbRoleId = dbRoleMap.get(role.id);
        if (!dbRoleId) continue;

        const templateId = role.roleTemplateId || "";
        const isPrivileged = PRIVILEGED_TEMPLATE_IDS.has(templateId);

        roleIdsToClean.push(dbRoleId);

        for (const member of members) {
          const userEntraId = member.id;
          const email = (member.mail || member.userPrincipalName || "").toLowerCase();
          const colaboradorId = entraMap.get(userEntraId) || emailMap.get(email) || null;

          allMemberInserts.push({
            role_id: dbRoleId,
            user_entra_id: userEntraId,
            user_display_name: member.displayName || null,
            user_email: email || null,
            colaborador_id: colaboradorId,
            updated_at: new Date().toISOString(),
          });
          totalMembers++;

          if (isPrivileged && !colaboradorId) {
            alertInserts.push({
              titulo: `Membro privilegiado não vinculado: ${member.displayName}`,
              mensagem: `O usuário "${member.displayName}" (${email}) possui a role privilegiada "${role.displayName}" mas não está vinculado a nenhum colaborador ativo no sistema.`,
              severidade: "aviso",
              tipo: "privilegiado_nao_vinculado",
              ref_tipo: "entra_role",
              ref_id: dbRoleId,
            });
            alertsGenerated++;
          }
        }

        if (isPrivileged && members.length > 3) {
          alertInserts.push({
            titulo: `Role privilegiada com ${members.length} membros: ${role.displayName}`,
            mensagem: `A role "${role.displayName}" possui ${members.length} membros atribuídos, o que excede o limite recomendado de 3 para roles privilegiadas.`,
            severidade: "critico",
            tipo: "privilegiado_excesso",
            ref_tipo: "entra_role",
            ref_id: dbRoleId,
          });
          alertsGenerated++;
        }
      }
    }
    console.log(`Fetched ${totalMembers} members across ${roles.length} roles`);

    // 7. Delete old members for all processed roles in batch
    for (let i = 0; i < roleIdsToClean.length; i += 50) {
      const chunk = roleIdsToClean.slice(i, i + 50);
      await sb.from("entra_role_members" as any).delete().in("role_id", chunk);
    }

    // 8. Insert all members in batch (chunks of 500)
    for (let i = 0; i < allMemberInserts.length; i += 500) {
      await sb.from("entra_role_members" as any).insert(allMemberInserts.slice(i, i + 500));
    }
    console.log("Members inserted");

    // 9. Insert alerts in batch
    if (alertInserts.length > 0) {
      for (let i = 0; i < alertInserts.length; i += 500) {
        await sb.from("alertas" as any).insert(alertInserts.slice(i, i + 500));
      }
    }

    // 10. Audit log
    await sb.from("auditoria" as any).insert({
      acao: "sync",
      entidade: "entra_roles",
      resumo: `Sincronização de roles: ${roles.length} roles, ${totalMembers} membros, ${alertsGenerated} alertas`,
      operador: "sistema",
    });

    console.log("Sync complete");

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
