// Helpers compartilhados do Microsoft Graph (token, resolução de identidade,
// índice de usuários) — usados por reconcile-identities, sync-user-access e
// pelos sync-*. Matching é ESTRITO: e-mail/UPN/proxy, SAM ou employeeId exatos;
// qualquer ambiguidade retorna "ambiguous" em vez de escolher um candidato.

export const GRAPH = "https://graph.microsoft.com/v1.0";

export interface GraphUser {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string | null;
  userPrincipalName?: string;
  onPremisesSamAccountName?: string | null;
  onPremisesSyncEnabled?: boolean | null;
  employeeId?: string | null;
  otherMails?: string[];
  proxyAddresses?: string[];
  accountEnabled?: boolean;
  createdDateTime?: string;
}

export async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) throw new Error("Credenciais Azure não configuradas (AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET)");
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Azure auth failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const { access_token } = await res.json();
  return access_token;
}

export function graphHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function normalizeIdentifier(value: unknown): string {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export type ResolveResult =
  | { status: "found"; userId: string; resolvedBy: string; user: GraphUser }
  | { status: "not_found"; resolvedBy: string }
  | { status: "ambiguous"; resolvedBy: string; candidates: string[] };

/**
 * Resolve um usuário no Entra ID de forma estrita, na ordem: entra_id (objectId),
 * e-mail/UPN exato, SAM exato. Mais de um resultado ⇒ "ambiguous" (nunca escolhe).
 */
export async function resolveEntraUser(
  token: string,
  identity: { entraId?: string | null; email?: string | null; sam?: string | null },
): Promise<ResolveResult> {
  const headers = graphHeaders(token);
  const select = "$select=id,displayName,mail,userPrincipalName,onPremisesSamAccountName,accountEnabled,onPremisesSyncEnabled";

  if (identity.entraId) {
    const res = await fetch(`${GRAPH}/users/${encodeURIComponent(identity.entraId)}?${select}`, { headers });
    if (res.ok) {
      const u = await res.json() as GraphUser;
      return { status: "found", userId: u.id, resolvedBy: `entra_id:${identity.entraId}`, user: u };
    }
    if (res.status !== 404) console.warn(`[resolveEntraUser] by id ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  if (identity.email) {
    const safe = identity.email.replace(/'/g, "''");
    const res = await fetch(`${GRAPH}/users?$filter=mail eq '${safe}' or userPrincipalName eq '${safe}'&${select}&$top=5`, { headers });
    if (res.ok) {
      const data = await res.json();
      const hits: GraphUser[] = data.value || [];
      if (hits.length === 1) return { status: "found", userId: hits[0].id, resolvedBy: `email:${identity.email}`, user: hits[0] };
      if (hits.length > 1) return { status: "ambiguous", resolvedBy: `email:${identity.email}`, candidates: hits.map((h) => h.userPrincipalName || h.id) };
    } else {
      console.warn(`[resolveEntraUser] by email ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  if (identity.sam) {
    const safe = identity.sam.replace(/'/g, "''");
    const res = await fetch(`${GRAPH}/users?$filter=onPremisesSamAccountName eq '${safe}'&${select}&$top=5`, { headers });
    if (res.ok) {
      const data = await res.json();
      const hits: GraphUser[] = data.value || [];
      if (hits.length === 1) return { status: "found", userId: hits[0].id, resolvedBy: `sam:${identity.sam}`, user: hits[0] };
      if (hits.length > 1) return { status: "ambiguous", resolvedBy: `sam:${identity.sam}`, candidates: hits.map((h) => h.userPrincipalName || h.id) };
    }
  }

  return { status: "not_found", resolvedBy: `not_found (entra_id: ${identity.entraId || "-"}, email: ${identity.email || "-"}, sam: ${identity.sam || "-"})` };
}

export async function fetchAllGraphUsers(token: string, onProgress?: (count: number) => Promise<void>): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  const headers = { ...graphHeaders(token), ConsistencyLevel: "eventual" };
  const select = [
    "id", "displayName", "givenName", "surname", "mail", "userPrincipalName", "onPremisesSamAccountName",
    "onPremisesSyncEnabled", "employeeId", "otherMails", "proxyAddresses", "accountEnabled", "createdDateTime",
  ].join(",");
  let url = `${GRAPH}/users?$select=${select}&$top=999`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Falha ao baixar usuários do Entra (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    users.push(...(body.value || []));
    if (onProgress) await onProgress(users.length);
    url = body["@odata.nextLink"] || "";
  }
  return users;
}

export interface EntraIndex {
  byId: Map<string, GraphUser>;
  byEmail: Map<string, GraphUser[]>;
  bySam: Map<string, GraphUser[]>;
  byEmployee: Map<string, GraphUser[]>;
}

export function buildEntraIndex(users: GraphUser[]): EntraIndex {
  const add = (m: Map<string, GraphUser[]>, k: string, u: GraphUser) => {
    if (!k) return;
    const cur = m.get(k) || [];
    if (!cur.some((x) => x.id === u.id)) cur.push(u);
    m.set(k, cur);
  };
  const idx: EntraIndex = { byId: new Map(), byEmail: new Map(), bySam: new Map(), byEmployee: new Map() };
  for (const u of users) {
    idx.byId.set(u.id, u);
    const emails = new Set<string>();
    if (u.mail) emails.add(normalizeIdentifier(u.mail));
    if (u.userPrincipalName) emails.add(normalizeIdentifier(u.userPrincipalName));
    for (const o of u.otherMails || []) emails.add(normalizeIdentifier(o));
    for (const p of u.proxyAddresses || []) {
      const cleaned = String(p || "").replace(/^smtp:/i, "");
      if (cleaned) emails.add(normalizeIdentifier(cleaned));
    }
    for (const e of emails) add(idx.byEmail, e, u);
    add(idx.bySam, normalizeIdentifier(u.onPremisesSamAccountName), u);
    add(idx.byEmployee, normalizeIdentifier(u.employeeId), u);
  }
  return idx;
}

export type IndexMatch =
  | { status: "found"; user: GraphUser; matchedBy: string }
  | { status: "ambiguous"; matchedBy: string; candidates: GraphUser[] }
  | { status: "not_found" };

/** Matching estrito contra o índice: entra_id → e-mail(s) → SAM → matrícula. */
export function matchEntraUser(
  identity: { entra_id?: string | null; email?: string | null; sam_account_name?: string | null; matricula?: string | null; extraEmails?: (string | null | undefined)[] },
  idx: EntraIndex,
): IndexMatch {
  if (identity.entra_id && idx.byId.has(identity.entra_id)) {
    return { status: "found", user: idx.byId.get(identity.entra_id)!, matchedBy: `entra_id:${identity.entra_id}` };
  }
  const emails = [identity.email, ...(identity.extraEmails || [])].map(normalizeIdentifier).filter(Boolean);
  for (const e of emails) {
    const hits = idx.byEmail.get(e) || [];
    if (hits.length === 1) return { status: "found", user: hits[0], matchedBy: `email:${e}` };
    if (hits.length > 1) return { status: "ambiguous", matchedBy: `email:${e}`, candidates: hits };
  }
  const sam = normalizeIdentifier(identity.sam_account_name);
  if (sam) {
    const hits = idx.bySam.get(sam) || [];
    if (hits.length === 1) return { status: "found", user: hits[0], matchedBy: `sam:${sam}` };
    if (hits.length > 1) return { status: "ambiguous", matchedBy: `sam:${sam}`, candidates: hits };
  }
  const mat = normalizeIdentifier(identity.matricula);
  if (mat && !mat.startsWith("sem_mat_")) {
    const hits = idx.byEmployee.get(mat) || [];
    if (hits.length === 1) return { status: "found", user: hits[0], matchedBy: `employeeId:${mat}` };
    if (hits.length > 1) return { status: "ambiguous", matchedBy: `employeeId:${mat}`, candidates: hits };
  }
  return { status: "not_found" };
}
