import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRIVILEGED_TEMPLATE_IDS = new Set([
  "62e90394-69f5-4237-9190-012177145e10",
  "e8611ab8-c189-46e8-94e1-60213ab1f814",
  "194ae4cb-b126-40b2-bd5b-6091b380977d",
  "f28a1f50-f6e7-4571-818b-6a12f2af6b6c",
  "29232cdf-9323-42fd-ade2-1d097af3e4de",
  "fe930be7-5e62-47db-91af-98c3a49a38b1",
  "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3",
  "158c047a-c907-4556-b7ef-446551a6b5f7",
  "b0f54661-2d74-4c50-afa3-1ec803f12efe",
  "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9",
  "729827e3-9c14-49f7-bb1b-9608f156bbb8",
  "966707d0-3269-4727-9be2-8c3a10f19b9d",
  "7be44c8a-adaf-4e2a-84d6-ab2649e08a13",
  "e6d1a23a-da11-4be4-9570-befc86d067a7",
  "44367163-eba1-44c3-98af-f5787879f96a",
  "11648597-926c-4cf3-9c36-bcebb0ba8dcc",
  "fdd7a751-b60b-444a-984c-02652fe8fa1c",
  "3a2c62db-5318-420d-8d74-23affee5d9d5",
  "69091246-20e8-4a56-aa4d-066075b2a7a8",
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

async function fetchPrincipalInfo(token: string, principalId: string): Promise<{ displayName?: string; mail?: string; upn?: string; type?: string } | null> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/directoryObjects/${principalId}?$select=id,displayName,mail,userPrincipalName`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { displayName: data.displayName, mail: data.mail, upn: data.userPrincipalName, type: data["@odata.type"] };
  } catch { return null; }
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

    // 1. Active directory roles + full role definitions catalog
    const roles = await graphGetAll(token, "https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId");
    const roleDefs = await graphGetAll(token, "https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions?$select=id,displayName,description,isBuiltIn,templateId");
    const defByTemplate = new Map(roleDefs.map((d: any) => [d.templateId || d.id, d]));
    const defById = new Map(roleDefs.map((d: any) => [d.id, d]));
    console.log(`Fetched ${roles.length} active roles, ${roleDefs.length} role definitions`);

    // 2. Known admin/breakglass accounts
    const { data: knownAdmins } = await sb.from("contas_admin_conhecidas").select("entra_id");
    const knownAdminSet = new Set((knownAdmins || []).map((a: any) => a.entra_id));

    // 3. Param: max members alert threshold
    const { data: paramRow } = await sb.from("parametros").select("valor").eq("chave", "priv_role_max_membros").maybeSingle();
    const maxMembros = Number(paramRow?.valor || 3) || 3;

    // 4. Colaboradores for matching (any status, ativo prioritized)
    const { data: colabs } = await sb.from("colaboradores").select("id, entra_id, email, status");
    const entraMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    (colabs || []).forEach((c: any) => {
      if (c.entra_id && !entraMap.has(c.entra_id)) entraMap.set(c.entra_id, c.id);
      if (c.email) {
        const k = c.email.toLowerCase();
        if (!emailMap.has(k)) emailMap.set(k, c.id);
      }
    });

    // 5. Upsert all currently-activated roles
    const roleUpserts = roles.map((role: any) => {
      const templateId = role.roleTemplateId || "";
      const def = defByTemplate.get(templateId);
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
    for (let i = 0; i < roleUpserts.length; i += 500) {
      await sb.from("entra_roles").upsert(roleUpserts.slice(i, i + 500), { onConflict: "role_id" });
    }

    // 6. Build mapping templateId -> dbRoleId. Also resolve PIM defIds to templateIds.
    const { data: dbRoles } = await sb.from("entra_roles").select("id, role_id, template_id");
    const dbRoleByRoleId = new Map((dbRoles || []).map((r: any) => [r.role_id, r.id]));
    const dbRoleByTemplate = new Map((dbRoles || []).filter((r: any) => r.template_id).map((r: any) => [r.template_id, r.id]));

    // For PIM schedules we may discover roles not yet "activated" in directoryRoles.
    // Upsert any missing role definitions we encounter.
    async function ensureRoleDbId(roleDefinitionId: string): Promise<string | null> {
      const def: any = defById.get(roleDefinitionId);
      if (!def) return null;
      const templateId = def.templateId || roleDefinitionId;
      const existing = dbRoleByTemplate.get(templateId);
      if (existing) return existing;
      const row = {
        role_id: `tpl:${templateId}`,
        nome: def.displayName || "Unknown",
        descricao: def.description || null,
        is_privileged: PRIVILEGED_TEMPLATE_IDS.has(templateId),
        is_built_in: def.isBuiltIn ?? true,
        template_id: templateId,
        updated_at: new Date().toISOString(),
      };
      await sb.from("entra_roles").upsert(row, { onConflict: "role_id" });
      const { data } = await sb.from("entra_roles").select("id").eq("template_id", templateId).maybeSingle();
      if (data?.id) {
        dbRoleByTemplate.set(templateId, data.id);
        return data.id;
      }
      return null;
    }

    const allMemberInserts: any[] = [];
    const alertInserts: any[] = [];
    const dbRoleIdsTouched = new Set<string>();
    let totalMembers = 0;
    let alertsGenerated = 0;

    // 7. Permanent active members via /directoryRoles/{id}/members
    const CONCURRENCY = 5;
    const roleMemberCount = new Map<string, number>();
    for (let i = 0; i < roles.length; i += CONCURRENCY) {
      const batch = roles.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (role: any) => {
          const members = await graphGetAll(token, `https://graph.microsoft.com/v1.0/directoryRoles/${role.id}/members?$select=id,displayName,mail,userPrincipalName`);
          return { role, members };
        })
      );
      for (const { role, members } of results) {
        const dbRoleId = dbRoleByRoleId.get(role.id);
        if (!dbRoleId) continue;
        dbRoleIdsTouched.add(dbRoleId);
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
            assignment_type: "permanente",
            start_at: null,
            end_at: null,
            directory_scope_id: "/",
            updated_at: new Date().toISOString(),
          });
          totalMembers++;
        }
        roleMemberCount.set(dbRoleId, (roleMemberCount.get(dbRoleId) || 0) + members.length);
      }
    }

    // 8. PIM — eligible schedules
    let eligible: any[] = [];
    try {
      eligible = await graphGetAll(token, "https://graph.microsoft.com/v1.0/roleManagement/directory/roleEligibilitySchedules?$select=id,principalId,roleDefinitionId,directoryScopeId,scheduleInfo,status");
      console.log(`Fetched ${eligible.length} eligible PIM schedules`);
    } catch (e: any) { console.warn("PIM eligible not available:", e.message); }

    // 9. PIM — active assignment schedules (includes activations + permanent assignments via PIM)
    let activeSched: any[] = [];
    try {
      activeSched = await graphGetAll(token, "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignmentSchedules?$select=id,principalId,roleDefinitionId,directoryScopeId,scheduleInfo,assignmentType,memberType,status");
      console.log(`Fetched ${activeSched.length} active PIM schedules`);
    } catch (e: any) { console.warn("PIM assignment schedules not available:", e.message); }

    // helper to enrich principal & queue insert
    const principalCache = new Map<string, any>();
    async function pushPimRow(entry: any, assignmentType: "elegivel" | "ativo_pim") {
      const dbRoleId = await ensureRoleDbId(entry.roleDefinitionId);
      if (!dbRoleId) return;
      let principal = principalCache.get(entry.principalId);
      if (!principal) {
        principal = await fetchPrincipalInfo(token, entry.principalId);
        principalCache.set(entry.principalId, principal);
      }
      const email = (principal?.mail || principal?.upn || "").toLowerCase();
      const colaboradorId = entraMap.get(entry.principalId) || emailMap.get(email) || null;
      allMemberInserts.push({
        role_id: dbRoleId,
        user_entra_id: entry.principalId,
        user_display_name: principal?.displayName || null,
        user_email: email || null,
        colaborador_id: colaboradorId,
        assignment_type: assignmentType,
        start_at: entry.scheduleInfo?.startDateTime || null,
        end_at: entry.scheduleInfo?.expiration?.endDateTime || null,
        directory_scope_id: entry.directoryScopeId || "/",
        updated_at: new Date().toISOString(),
      });
      totalMembers++;
      dbRoleIdsTouched.add(dbRoleId);
      roleMemberCount.set(dbRoleId, (roleMemberCount.get(dbRoleId) || 0) + 1);
    }

    for (const e of eligible) await pushPimRow(e, "elegivel");
    for (const a of activeSched) {
      // Skip duplicates of permanent assignments already captured via /directoryRoles
      const isActivation = a.memberType === "Direct" && a.scheduleInfo?.expiration?.endDateTime;
      if (isActivation) await pushPimRow(a, "ativo_pim");
    }

    // 10. Generate alerts (de-duplicated by user; ignore known admin accounts)
    const memberByRole = new Map<string, any[]>();
    for (const m of allMemberInserts) {
      const arr = memberByRole.get(m.role_id) || [];
      arr.push(m);
      memberByRole.set(m.role_id, arr);
    }
    const { data: dbRolesPriv } = await sb.from("entra_roles").select("id, nome, is_privileged");
    const privRoleMap = new Map((dbRolesPriv || []).map((r: any) => [r.id, r]));
    for (const [dbRoleId, members] of memberByRole) {
      const role: any = privRoleMap.get(dbRoleId);
      if (!role?.is_privileged) continue;
      const distinct = new Set(members.map((m: any) => m.user_entra_id));
      if (distinct.size > maxMembros) {
        alertInserts.push({
          titulo: `Role privilegiada com ${distinct.size} membros: ${role.nome}`,
          mensagem: `A role "${role.nome}" possui ${distinct.size} membros (limite recomendado: ${maxMembros}).`,
          severidade: "critico",
          tipo: "privilegiado_excesso",
          ref_tipo: "entra_role",
          ref_id: dbRoleId,
        });
        alertsGenerated++;
      }
      for (const m of members) {
        if (m.colaborador_id) continue;
        if (knownAdminSet.has(m.user_entra_id)) continue;
        alertInserts.push({
          titulo: `Membro privilegiado não vinculado: ${m.user_display_name || m.user_email}`,
          mensagem: `O usuário "${m.user_display_name || m.user_email}" possui a role privilegiada "${role.nome}" mas não está vinculado a um colaborador. Se for uma conta administrativa, cadastre-a em "Contas administrativas conhecidas".`,
          severidade: "aviso",
          tipo: "privilegiado_nao_vinculado",
          ref_tipo: "entra_role",
          ref_id: dbRoleId,
        });
        alertsGenerated++;
      }
    }

    // 11. Replace members for touched roles
    const touched = Array.from(dbRoleIdsTouched);
    for (let i = 0; i < touched.length; i += 50) {
      const chunk = touched.slice(i, i + 50);
      await sb.from("entra_role_members").delete().in("role_id", chunk);
    }
    for (let i = 0; i < allMemberInserts.length; i += 500) {
      await sb.from("entra_role_members").insert(allMemberInserts.slice(i, i + 500));
    }

    if (alertInserts.length > 0) {
      for (let i = 0; i < alertInserts.length; i += 500) {
        await sb.from("alertas").insert(alertInserts.slice(i, i + 500));
      }
    }

    // 12. Persist freshness marker
    await sb.from("parametros").update({ valor: new Date().toISOString() }).eq("chave", "entra_roles_last_sync");

    await sb.from("auditoria").insert({
      acao: "sync",
      entidade: "entra_roles",
      resumo: `Sincronização de roles: ${roles.length} roles ativas, ${eligible.length} elegíveis PIM, ${totalMembers} atribuições, ${alertsGenerated} alertas`,
      operador: "sistema",
    });

    console.log("Sync complete");

    return new Response(JSON.stringify({
      success: true,
      roles: roles.length,
      members: totalMembers,
      eligible: eligible.length,
      active_pim: activeSched.length,
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
