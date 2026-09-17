// Motor ÚNICO de importação da base do RH (CSV) — usado por sync-sharepoint-csv
// (ciclo diário) e sync-csv-colab (upload manual).
//
// Regras:
//   • Nunca apaga colaborador. Ausente no CSV ⇒ leaver via jml_alterar_status('desligado').
//   • Rede de proteção: se os ausentes excederem csv_leaver_limite_pct/abs, NÃO aplica
//     desligamentos, gera alerta crítico e registra os ausentes em colab_quarentena.
//   • Linhas sem matrícula ou duplicadas no arquivo vão para colab_quarentena
//     (não viram identidades novas).
//   • Recontratação: mesma pessoa (CPF) com matrícula nova ⇒ mesma identidade.
//   • E-mail corporativo é gerado SÓ na criação; nunca regenerado para quem já existe.
//   • Todo JML (joiner/mover/leaver/reativação) passa pelos RPCs transacionais do banco,
//     que já cuidam de fila, acesso efetivo, eventos e auditoria.
//   • Exceção "manter ativo" aprovada e desligamento manual na ferramenta são respeitados.

export interface CsvRow { [key: string]: string }
type Sb = any;

export interface SyncOptions {
  source: "sharepoint" | "upload";
  filename: string;
  operador?: string;
  dryRun?: boolean;
}

export interface SyncResult {
  success: boolean;
  jobId: string;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  quarantined: number;
  rehired: number;
  linkedManual: number;
  leaverGuardTriggered: boolean;
  dryRun: boolean;
  total: number;
  rawTotal: number;
}

const REQUIRED_HEADERS = ["displayName", "employID", "mail", "company", "title", "status", "Data_Admissao", "Cadastro_Pessoa_Fisica", "Base_Local"];

const STATUS_MAP: Record<string, string> = {
  ativo: "ativo", demitido: "desligado", desligado: "desligado", afastado: "afastado",
  "férias": "ferias", ferias: "ferias", inativo: "inativo", suspenso: "afastado",
  licenca: "afastado", "licença": "afastado", aposentado: "desligado", transferido: "ativo",
  "afast aux doenca": "afastado", "afast aux maternidade": "afastado", "atestado medico": "afastado", "licenca maternidade": "afastado",
};
const PLACEHOLDER_EMPRESA_ID = "00000000-0000-0000-0000-000000000000";

// ─── Parsing ─────────────────────────────────────────────────────────────────
function normalizeHeader(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}
function findHeaderMatch(headers: string[], target: string): string | null {
  const nt = normalizeHeader(target);
  return headers.find((h) => h === target) || headers.find((h) => normalizeHeader(h) === nt) || headers.find((h) => normalizeHeader(h).includes(nt)) || null;
}
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}
function detectDelimiter(headerLine: string): string {
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
}

export interface ParsedCsv { rows: CsvRow[]; invalid: { row: CsvRow; motivo: string; detalhe: string }[] }

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem dados");
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headerMap: Record<string, string> = {};
  const missing: string[] = [];
  for (const req of REQUIRED_HEADERS) {
    const m = findHeaderMatch(rawHeaders, req);
    if (m) headerMap[req] = m; else missing.push(req);
  }
  if (missing.length > 0) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);
  const reverse: Record<string, string> = {};
  for (const [std, actual] of Object.entries(headerMap)) reverse[actual] = std;

  const rows: CsvRow[] = [];
  const invalid: ParsedCsv["invalid"] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < rawHeaders.length * 0.5) continue;
    const row: CsvRow = {};
    rawHeaders.forEach((h, idx) => { row[h] = values[idx] || ""; if (reverse[h]) row[reverse[h]] = values[idx] || ""; });
    row["__linha"] = String(i + 1);
    if (!(row.employID || "").trim()) { invalid.push({ row, motivo: "sem_matricula", detalhe: `Linha ${i + 1} sem employID` }); continue; }
    if (!(row.displayName || "").trim()) { invalid.push({ row, motivo: "sem_nome", detalhe: `Linha ${i + 1} sem displayName` }); continue; }
    rows.push(row);
  }
  return { rows, invalid };
}

export function parseDate(d: string): string | null {
  if (!d || d === "NULL") return null;
  const parts = d.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function buildFingerprint(row: CsvRow): string {
  return [row.displayName, row.mail, (row.status || "ativo").toLowerCase(), row.company, row.description || row.title, row.departmentNumber, row.Base_Local, row.Cadastro_Pessoa_Fisica, row.Data_Admissao, row.Data_Rescisao]
    .map((v) => v || "").join("|").toLowerCase();
}

// ─── Dedupe canônico (CPF → mail → sam → matrícula) ──────────────────────────
function normStatus(s: string): string { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }
function mapStatus(s: string): string { return STATUS_MAP[normStatus(s)] || STATUS_MAP[(s || "").toLowerCase()] || "ativo"; }
function isActiveStatus(s: string): boolean { return ["ativo", "ferias", "afastado"].includes(mapStatus(s)); }
function normalizeCpf(v: string): string { return (v || "").replace(/\D/g, "").trim(); }
function normalizeMail(v: string): string { return (v || "").toLowerCase().trim(); }
function dedupeKey(row: CsvRow): string {
  const cpf = normalizeCpf(row.Cadastro_Pessoa_Fisica);
  if (cpf) return `cpf:${cpf}`;
  const mail = normalizeMail(row.mail);
  if (mail) return `mail:${mail}`;
  return `mat:${(row.employID || "").trim()}`;
}
function pickCanonical(a: CsvRow, b: CsvRow): CsvRow {
  const aA = isActiveStatus(a.status), bA = isActiveStatus(b.status);
  if (aA !== bA) return aA ? a : b;
  const aAdm = parseDate(a.Data_Admissao) || "", bAdm = parseDate(b.Data_Admissao) || "";
  if (aAdm !== bAdm) return aAdm > bAdm ? a : b;
  const aR = parseDate(a.Data_Rescisao) || "", bR = parseDate(b.Data_Rescisao) || "";
  if (aR !== bR) return aR > bR ? a : b;
  return a;
}
function dedupeRows(rows: CsvRow[]): { canonical: CsvRow[]; removed: { row: CsvRow; keptMatricula: string; key: string }[] } {
  const groups = new Map<string, CsvRow[]>();
  const byMat = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const k = dedupeKey(r); (groups.get(k) || groups.set(k, []).get(k)!).push(r);
    const m = (r.employID || "").trim(); (byMat.get(m) || byMat.set(m, []).get(m)!).push(r);
  }
  const canonical: CsvRow[] = [];
  const removed: { row: CsvRow; keptMatricula: string; key: string }[] = [];
  const seenMat = new Set<string>();
  for (const [k, arr] of groups) {
    let keep = arr[0];
    for (let i = 1; i < arr.length; i++) keep = pickCanonical(keep, arr[i]);
    for (const r of arr) if (r !== keep) removed.push({ row: r, keptMatricula: (keep.employID || "").trim(), key: k });
    const m = (keep.employID || "").trim();
    if (seenMat.has(m)) { removed.push({ row: keep, keptMatricula: m, key: `mat:${m}` }); continue; }
    seenMat.add(m);
    canonical.push(keep);
  }
  return { canonical, removed };
}

// ─── Proteção de identidade fraca (histórico não pode roubar mail/SAM de um ativo) ──
function deriveSam(row: CsvRow): string {
  const mail = normalizeMail(row.mail);
  return mail.includes("@") ? mail.split("@")[0] : (row.employID || "").trim().toLowerCase();
}
function applyWeakIdentityProtection(rows: CsvRow[]): number {
  const mailOwner = new Map<string, string>(), localOwner = new Map<string, string>(), samOwner = new Map<string, string>();
  for (const r of rows) {
    if (!isActiveStatus(r.status)) continue;
    const cpf = normalizeCpf(r.Cadastro_Pessoa_Fisica); if (!cpf) continue;
    const mail = normalizeMail(r.mail);
    if (mail) { if (!mailOwner.has(mail)) mailOwner.set(mail, cpf); const lp = mail.split("@")[0]; if (lp && !localOwner.has(lp)) localOwner.set(lp, cpf); }
    const sam = deriveSam(r); if (sam && !samOwner.has(sam)) samOwner.set(sam, cpf);
  }
  let n = 0;
  for (const r of rows) {
    if (isActiveStatus(r.status)) continue;
    const cpf = normalizeCpf(r.Cadastro_Pessoa_Fisica), mail = normalizeMail(r.mail), lp = mail.includes("@") ? mail.split("@")[0] : "", sam = deriveSam(r);
    const conflict = (mail && mailOwner.has(mail) && mailOwner.get(mail) !== cpf) || (lp && localOwner.has(lp) && localOwner.get(lp) !== cpf) || (sam && samOwner.has(sam) && samOwner.get(sam) !== cpf);
    if (conflict) { r["__weak_identity_protected"] = "true"; r["mail"] = ""; n++; }
  }
  return n;
}

// ─── E-mail corporativo (só para NOVOS) ──────────────────────────────────────
const PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e", "del", "di"]);
function normalizeNamePart(s: string): string { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, ""); }
export function generateCorporateEmail(displayName: string, domain: string, existing: Set<string>): string | null {
  const parts = (displayName || "").trim().split(/\s+/).map(normalizeNamePart).filter((p) => p && !PREPOSITIONS.has(p));
  if (parts.length === 0) return null;
  const d = "@" + domain.replace(/^@/, "");
  const first = parts[0], last = parts[parts.length - 1], middles = parts.slice(1, -1);
  const tries = parts.length === 1
    ? [first, ...Array.from({ length: 98 }, (_, i) => `${first}${i + 2}`)]
    : [`${first}.${last}`, ...(middles.length ? [`${first}.${middles[0]}`, `${first}.${middles[0]}.${last}`] : []), parts.join("."), ...Array.from({ length: 98 }, (_, i) => `${first}.${last}${i + 2}`)];
  for (const t of tries) { const c = `${t}${d}`; if (!existing.has(c)) return c; }
  return null;
}

// ─── Pré-checagem de existência no Entra (evita create_if_not_exists inútil) ─
async function preCheckEntraExistence(identities: { email: string | null; sam: string | null }[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const TENANT = Deno.env.get("AZURE_TENANT_ID"), CLIENT = Deno.env.get("AZURE_CLIENT_ID"), SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!TENANT || !CLIENT || !SECRET || identities.length === 0) return found;
  let token: string | null = null;
  try {
    const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT, client_secret: SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    token = res.ok ? (await res.json()).access_token : null;
  } catch { token = null; }
  if (!token) return found;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const run = async (values: string[], build: (v: string) => string) => {
    for (const batch of chunk(values, 15)) {
      const filter = batch.map((v) => build(v.replace(/'/g, "''"))).join(" or ");
      try {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,mail,userPrincipalName,onPremisesSamAccountName&$top=999`, { headers });
        if (!res.ok) { await res.text(); continue; }
        for (const u of (await res.json()).value || []) {
          if (u.mail) found.set(u.mail.toLowerCase(), u.id);
          if (u.userPrincipalName) found.set(u.userPrincipalName.toLowerCase(), u.id);
          if (u.onPremisesSamAccountName) found.set(`sam:${u.onPremisesSamAccountName.toLowerCase()}`, u.id);
        }
      } catch { /* ignore */ }
    }
  };
  await run([...new Set(identities.map((i) => i.email).filter(Boolean) as string[])], (v) => `mail eq '${v}' or userPrincipalName eq '${v}'`);
  await run([...new Set(identities.map((i) => i.sam).filter(Boolean) as string[])], (v) => `onPremisesSamAccountName eq '${v}'`);
  return found;
}

// ─── Motor ───────────────────────────────────────────────────────────────────
export async function processCsvColab(sb: Sb, csvText: string, opts: SyncOptions): Promise<SyncResult> {
  const requestedBy = opts.source === "sharepoint" ? "importacao_sharepoint" : "importacao_csv";
  const operador = opts.operador || requestedBy;
  const dryRun = !!opts.dryRun;

  // watchdog: jobs travados
  await sb.from("sync_jobs").update({ status: "error", error: "Interrompido por timeout do runtime", message: "Interrompido por timeout do runtime; dados parciais já importados" })
    .eq("tipo", "csv_colab").eq("status", "running").lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const { data: job, error: jobErr } = await sb.from("sync_jobs")
    .insert({ status: "running", tipo: "csv_colab", message: `Iniciando importação (${opts.source})${dryRun ? " — PRÉ-VISUALIZAÇÃO" : ""}…`, phase: "parsing", filename: opts.filename })
    .select().single();
  if (jobErr) throw jobErr;
  const jobId: string = job.id;
  const progress = (patch: Record<string, unknown>) => sb.from("sync_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);

  const quarantine: { matricula: string | null; nome: string | null; email: string | null; motivo: string; detalhe: string; dados: unknown; colaborador_id?: string | null }[] = [];

  try {
    // ── parâmetros ──
    const { data: pRows } = await sb.from("parametros").select("chave, valor").in("chave", [
      "csv_leaver_limite_pct", "csv_leaver_limite_abs", "csv_email_dominio", "csv_gerar_email_corporativo", "ad_upn_dominio",
    ]);
    const P = new Map<string, string>((pRows || []).map((r: any) => [r.chave, r.valor]));
    const numParam = (key: string, def: number) => { const v = Number(P.get(key)); return Number.isFinite(v) && P.get(key) !== undefined && P.get(key) !== "" ? v : def; };
    const leaverPct = numParam("csv_leaver_limite_pct", 5);
    const leaverAbs = numParam("csv_leaver_limite_abs", 50);
    const emailDomain = (P.get("csv_email_dominio") || "origoenergia.com.br").replace(/^@/, "").toLowerCase();
    const generateEmails = (P.get("csv_gerar_email_corporativo") ?? "true") !== "false";
    const upnDomain = (P.get("ad_upn_dominio") || "ebessolar.local").replace(/^@/, "");
    const preview = dryRun; // pré-visualização: classifica e reporta, não grava

    // ── parse + dedupe + proteção ──
    const parsed = parseCsv(csvText);
    for (const inv of parsed.invalid) quarantine.push({ matricula: (inv.row.employID || "").trim() || null, nome: inv.row.displayName || null, email: inv.row.mail || null, motivo: inv.motivo, detalhe: inv.detalhe, dados: inv.row });
    const rawTotal = parsed.rows.length + parsed.invalid.length;
    const dedupe = dedupeRows(parsed.rows);
    for (const d of dedupe.removed) quarantine.push({ matricula: (d.row.employID || "").trim(), nome: d.row.displayName, email: d.row.mail || null, motivo: "duplicado_no_csv", detalhe: `Duplicado (${d.key}); mantida a matrícula ${d.keptMatricula}`, dados: d.row });
    const rows = dedupe.canonical;
    const weakProtected = applyWeakIdentityProtection(rows);
    await progress({ message: `${rawTotal} linhas → ${rows.length} canônicas (${quarantine.length} em quarentena, ${weakProtected} protegidas). Comparando…`, phase: "comparing", colab_total: rows.length });

    // ── base existente ──
    type Existing = { id: string; matricula: string | null; fingerprint: string; cargo_id: string | null; area_id: string | null; empresa_id: string | null; sam: string | null; email: string | null; status: string; desligado_manual: boolean; desligado_manual_em: string | null; nome: string; cpf: string | null; origem: string };
    const existingByMat = new Map<string, Existing>();
    const existingByCpf = new Map<string, Existing>();
    const manualByCpf = new Map<string, Existing>(), manualByMail = new Map<string, Existing>(), manualBySam = new Map<string, Existing>(), manualByMat = new Map<string, Existing>();
    const existingEmails = new Set<string>();
    {
      let from = 0;
      while (true) {
        const { data } = await sb.from("colaboradores")
          .select("id, matricula, nome, email, status, cargo_id, area_id, empresa_id, cpf, import_hash, sam_account_name, desligado_manual, desligado_manual_em, origem")
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        for (const c of data as any[]) {
          const e: Existing = { id: c.id, matricula: c.matricula, fingerprint: c.import_hash || "", cargo_id: c.cargo_id, area_id: c.area_id, empresa_id: c.empresa_id, sam: c.sam_account_name, email: c.email, status: c.status, desligado_manual: !!c.desligado_manual, desligado_manual_em: c.desligado_manual_em, nome: c.nome, cpf: normalizeCpf(c.cpf || ""), origem: c.origem || "manual" };
          if (c.email) existingEmails.add(String(c.email).toLowerCase());
          if (e.origem === "csv") {
            if (c.matricula) existingByMat.set(c.matricula, e);
            if (e.cpf) existingByCpf.set(e.cpf, e);
          } else {
            if (e.cpf) manualByCpf.set(e.cpf, e);
            if (c.email) manualByMail.set(String(c.email).toLowerCase(), e);
            if (c.sam_account_name) manualBySam.set(String(c.sam_account_name).toLowerCase(), e);
            if (c.matricula) manualByMat.set(c.matricula, e);
          }
        }
        if (data.length < 1000) break;
        from += 1000;
      }
    }

    // exceções "manter ativo" vigentes (bloqueiam desligamento; jml_alterar_status também checa)
    const overrideIds = new Set<string>();
    {
      const { data: excs } = await sb.from("excecoes").select("colaborador_id, validade").in("tipo_excecao", ["manter_ativo", "status_manual"]).eq("status", "aprovada").gte("validade", new Date().toISOString().slice(0, 10));
      for (const e of excs || []) if (e.colaborador_id) overrideIds.add(e.colaborador_id);
    }

    // ── lookups ──
    await progress({ phase: "lookups", message: "Resolvendo empresas/cargos/áreas/localidades…", colab_percent: 10 });
    const caches = { empresa: new Map<string, string>(), cargo: new Map<string, string>(), area: new Map<string, string>(), local: new Map<string, string>() };
    const load = async () => {
      const [e, c, a, l] = await Promise.all([sb.from("empresas").select("id, nome"), sb.from("cargos").select("id, nome"), sb.from("areas").select("id, nome"), sb.from("localidades").select("id, nome")]);
      for (const r of e.data || []) caches.empresa.set(r.nome.toLowerCase(), r.id);
      for (const r of c.data || []) caches.cargo.set(r.nome.toLowerCase(), r.id);
      for (const r of a.data || []) caches.area.set(r.nome.toLowerCase(), r.id);
      for (const r of l.data || []) caches.local.set(r.nome.toLowerCase(), r.id);
    };
    await load();
    const missing = { empresa: new Set<string>(), cargo: new Set<string>(), area: new Set<string>(), local: new Set<string>() };
    for (const row of rows) {
      const company = row.company?.trim(); if (company && company !== "NULL" && !caches.empresa.has(company.toLowerCase())) missing.empresa.add(company);
      const cargo = (row.description || row.title || "").trim(); if (cargo && cargo !== "NULL" && !caches.cargo.has(cargo.toLowerCase())) missing.cargo.add(cargo);
      const area = row.departmentNumber?.trim(); if (area && area !== "NULL" && !caches.area.has(area.toLowerCase())) missing.area.add(area);
      const local = row.Base_Local?.trim(); if (local && local !== "NULL" && !caches.local.has(local.toLowerCase())) missing.local.add(local);
    }
    if (!preview) {
      for (const b of chunk([...missing.empresa].map((nome) => ({ nome })), 200)) await sb.from("empresas").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      for (const b of chunk([...missing.cargo].map((nome) => ({ nome })), 200)) await sb.from("cargos").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      for (const b of chunk([...missing.area].map((nome) => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200)) await sb.from("areas").insert(b);
      for (const b of chunk([...missing.local].map((nome) => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200)) await sb.from("localidades").insert(b);
      if (missing.empresa.size + missing.cargo.size + missing.area.size + missing.local.size > 0) await load();
    }
    const names = { cargo: new Map<string, string>(), area: new Map<string, string>(), empresa: new Map<string, string>() };
    for (const [n, id] of caches.cargo) names.cargo.set(id, n);
    for (const [n, id] of caches.area) names.area.set(id, n);
    for (const [n, id] of caches.empresa) names.empresa.set(id, n);

    const buildColabData = (row: CsvRow, existing: Existing | null) => {
      const protectedRow = row["__weak_identity_protected"] === "true";
      const csvMail = protectedRow ? "" : normalizeMail(row.mail);
      const csvSam = (row.sAMAccountName || "").trim() || null;
      let email: string | null; let sam: string | null;
      if (existing) {
        // nunca regenera; só adota o e-mail do RH se for corporativo e diferente do atual
        email = (csvMail && csvMail.endsWith("@" + emailDomain) && csvMail !== (existing.email || "").toLowerCase()) ? csvMail : (existing.email || (csvMail || null));
        sam = csvSam || existing.sam || (email && email.includes("@") ? email.split("@")[0] : null);
      } else if (protectedRow) {
        email = null; sam = null;
      } else if (csvMail && csvMail.endsWith("@" + emailDomain)) {
        email = csvMail; sam = csvSam || csvMail.split("@")[0];
      } else if (generateEmails) {
        const gen = generateCorporateEmail(row.displayName, emailDomain, existingEmails);
        if (gen) existingEmails.add(gen);
        email = gen; sam = csvSam || (gen ? gen.split("@")[0] : null);
      } else {
        email = csvMail || null; sam = csvSam || (csvMail.includes("@") ? csvMail.split("@")[0] : null);
      }
      return {
        nome: row.displayName, email, matricula: row.employID.trim(), cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: caches.empresa.get((row.company || "").toLowerCase()) || null,
        cargo_id: caches.cargo.get(((row.description || row.title || "").trim()).toLowerCase()) || null,
        area_id: caches.area.get((row.departmentNumber || "").toLowerCase()) || null,
        localidade_id: caches.local.get((row.Base_Local || "").toLowerCase()) || null,
        status: mapStatus(row.status), data_admissao: parseDate(row.Data_Admissao), data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv", ultima_importacao_id: jobId, import_hash: buildFingerprint(row), sam_account_name: sam,
      };
    };

    // ── classificação ──
    await progress({ phase: "classifying", message: "Classificando mudanças…", colab_percent: 20 });
    type Update = { existing: Existing; data: ReturnType<typeof buildColabData>; kind: "update" | "manual_link" | "rehire" };
    const toInsert: ReturnType<typeof buildColabData>[] = [];
    const toUpdate: Update[] = [];
    const csvMatriculas = new Set<string>();
    const unchangedIds: string[] = [];
    const claimedIds = new Set<string>();

    for (const row of rows) {
      const mat = row.employID.trim();
      csvMatriculas.add(mat);
      const fp = buildFingerprint(row);
      const existing = existingByMat.get(mat);
      if (existing) {
        claimedIds.add(existing.id);
        if (existing.fingerprint === fp) { unchangedIds.push(existing.id); continue; }
        toUpdate.push({ existing, data: buildColabData(row, existing), kind: "update" });
        continue;
      }
      const cpf = normalizeCpf(row.Cadastro_Pessoa_Fisica);
      const mail = normalizeMail(row.mail);
      const samGuess = mail.includes("@") ? mail.split("@")[0] : mat.toLowerCase();
      // recontratação: mesma pessoa (CPF) com matrícula nova
      const rehire = cpf ? existingByCpf.get(cpf) : undefined;
      if (rehire && !claimedIds.has(rehire.id)) {
        claimedIds.add(rehire.id);
        toUpdate.push({ existing: rehire, data: buildColabData(row, rehire), kind: "rehire" });
        continue;
      }
      // vínculo com colaborador criado manualmente (Novo Colaborador direto no AD)
      const manual = (cpf && manualByCpf.get(cpf)) || (mail && manualByMail.get(mail)) || manualBySam.get(samGuess) || manualByMat.get(mat);
      if (manual && !claimedIds.has(manual.id)) {
        claimedIds.add(manual.id);
        toUpdate.push({ existing: manual, data: buildColabData(row, manual), kind: "manual_link" });
        continue;
      }
      toInsert.push(buildColabData(row, null));
    }

    // ausentes (só origem csv, não reivindicados nesta carga)
    const leavers: Existing[] = [];
    let leaverSkippedOverride = 0;
    for (const [mat, e] of existingByMat) {
      if (csvMatriculas.has(mat) || claimedIds.has(e.id)) continue;
      if (e.status === "desligado") continue;               // já desligado: nada a fazer
      if (overrideIds.has(e.id)) { leaverSkippedOverride++; continue; }
      leavers.push(e);
    }
    const activeBase = [...existingByMat.values()].filter((e) => e.status !== "desligado").length;
    // regra percentual só faz sentido com base mínima (evita falso positivo em bases pequenas/de teste)
    const leaverGuardTriggered = leavers.length > 0 && (leavers.length > leaverAbs || (activeBase >= 20 && (leavers.length / activeBase) * 100 > leaverPct));

    console.log(`[csv-sync] insert=${toInsert.length} update=${toUpdate.length} unchanged=${unchangedIds.length} leavers=${leavers.length} guard=${leaverGuardTriggered} quarantine=${quarantine.length}`);

    if (preview) {
      await progress({ status: "done", phase: "done", colab_percent: 100, colab_created: toInsert.length, colab_updated: toUpdate.length, colab_inativos: leavers.length, colab_quarentena: quarantine.length,
        message: `PRÉ-VISUALIZAÇÃO — nada gravado: ${toInsert.length} novos, ${toUpdate.length} atualizados, ${unchangedIds.length} inalterados, ${leavers.length} ausentes${leaverGuardTriggered ? " (LIMITE DE SEGURANÇA seria acionado)" : ""}, ${quarantine.length} em quarentena.` });
      return { success: true, jobId, created: toInsert.length, updated: toUpdate.length, unchanged: unchangedIds.length, removed: leavers.length, quarantined: quarantine.length, rehired: toUpdate.filter((u) => u.kind === "rehire").length, linkedManual: toUpdate.filter((u) => u.kind === "manual_link").length, leaverGuardTriggered, dryRun: true, total: rows.length, rawTotal };
    }

    // ── inserts ──
    await progress({ phase: "inserting", message: `Inserindo ${toInsert.length} novos…`, colab_percent: 30 });
    const inserted: { id: string; data: ReturnType<typeof buildColabData> }[] = [];
    for (const batch of chunk(toInsert, 200)) {
      const { data, error } = await sb.from("colaboradores").insert(batch).select("id, matricula");
      if (error) {
        // lote falhou (ex.: unicidade) → tenta um a um e manda o problemático para a quarentena
        for (const one of batch) {
          const { data: d1, error: e1 } = await sb.from("colaboradores").insert(one).select("id, matricula").single();
          if (e1) quarantine.push({ matricula: one.matricula, nome: one.nome, email: one.email, motivo: "erro_insercao", detalhe: e1.message, dados: one });
          else inserted.push({ id: d1.id, data: one });
        }
      } else {
        for (const d of data || []) { const src = batch.find((b) => b.matricula === d.matricula); if (src) inserted.push({ id: d.id, data: src }); }
      }
    }

    // ── updates (dados cadastrais primeiro; status e cargo via RPC) ──
    await progress({ phase: "updating", message: `Atualizando ${toUpdate.length} registros…`, colab_percent: 50 });
    let updated = 0, rehired = 0, linkedManual = 0;
    for (const u of toUpdate) {
      const { status: newStatus, cargo_id: newCargo, ...rest } = u.data;
      // desligado manualmente na ferramenta: CSV ainda "ativo" não reativa (até o RH convergir)
      let statusToApply: string | null = newStatus;
      if (u.existing.desligado_manual) {
        if (newStatus === "ativo") {
          statusToApply = null;
          await sb.from("alertas").insert({ titulo: "CSV divergente — desligamento manual", mensagem: `${u.data.nome}: CSV ainda traz como ativo, mas foi desligado manualmente na ferramenta. Reativação bloqueada.`, severidade: "aviso", tipo: "csv_divergencia_desligamento", ref_url: `/colaboradores/${u.existing.id}` });
        } else if (newStatus === "desligado" || newStatus === "inativo") {
          await sb.from("colaboradores").update({ desligado_manual: false, desligado_manual_em: null, desligado_manual_por: null }).eq("id", u.existing.id);
        }
      }
      const { error } = await sb.from("colaboradores").update({ ...rest, cargo_id: newCargo }).eq("id", u.existing.id);
      if (error) { quarantine.push({ matricula: u.data.matricula, nome: u.data.nome, email: u.data.email, motivo: "erro_atualizacao", detalhe: error.message, dados: u.data, colaborador_id: u.existing.id }); continue; }
      updated++;
      if (u.kind === "rehire") rehired++;
      if (u.kind === "manual_link") linkedManual++;

      // 1) status (leaver / reativação / férias) via RPC transacional
      let finalStatus = u.existing.status;
      if (statusToApply && statusToApply !== u.existing.status) {
        const { data: r, error: e4 } = await sb.rpc("jml_alterar_status", { p_colaborador_id: u.existing.id, p_novo_status: statusToApply, p_operador: operador, p_origem: "importacao_csv", p_motivo: `Status no CSV do RH: ${u.data.status}` });
        if (e4) console.warn(`[csv-sync] jml_alterar_status ${u.existing.id}: ${e4.message}`);
        else if (r && r.ok === false) console.log(`[csv-sync] status preservado (${r.error}): ${u.existing.id}`);
        else finalStatus = statusToApply;
      }
      const stillActive = !["desligado", "inativo"].includes(finalStatus);

      // 2) cargo (mover) — só para quem continua ativo; vínculo manual provisiona o cargo completo
      if (stillActive && newCargo && (u.kind === "manual_link" || newCargo !== u.existing.cargo_id)) {
        const { error: e2 } = await sb.rpc("jml_alterar_cargo", { p_colaborador_id: u.existing.id, p_novo_cargo_id: newCargo, p_operador: operador, p_origem: "importacao_csv", p_cargo_anterior_id: u.kind === "manual_link" ? null : u.existing.cargo_id, p_atualizar_colaborador: false });
        if (e2) console.warn(`[csv-sync] jml_alterar_cargo ${u.existing.id}: ${e2.message}`);
      }

      // 3) atributos AD (title/department/company) quando mudaram
      const changed: string[] = []; const values: Record<string, string | null> = {};
      if (newCargo !== u.existing.cargo_id) { changed.push("title"); values.title = newCargo ? names.cargo.get(newCargo) || null : null; }
      if (u.data.area_id !== u.existing.area_id) { changed.push("department"); values.department = u.data.area_id ? names.area.get(u.data.area_id) || null : null; }
      if (u.data.empresa_id !== u.existing.empresa_id) { changed.push("company"); values.company = u.data.empresa_id ? names.empresa.get(u.data.empresa_id) || null : null; }
      const sam = u.data.sam_account_name || u.existing.sam;
      if (changed.length > 0 && sam && stillActive) {
        const { error: e3 } = await sb.from("iam_queue").insert({
          action_type: "update", colaborador_id: u.existing.id, target_identity: sam, requested_by: requestedBy, status: "pending",
          resource_key: `ad_attrs:${sam}:${changed.join(",")}`,
          payload_json: { samAccountName: sam, mail: u.data.email || "", displayName: u.data.nome || "", status: "enabled", changed_fields: changed, new_values: values },
        });
        if (e3 && !/duplicate key/i.test(e3.message)) console.warn(`[csv-sync] update AD: ${e3.message}`);
        if (!changed.includes("title")) {
          await sb.from("eventos_jml").insert({ tipo: "mover", status: "executado", colaborador_id: u.existing.id, colaborador_nome: u.data.nome, origem: "importacao_csv", dados_antes: { area_id: u.existing.area_id, empresa_id: u.existing.empresa_id }, dados_depois: { area_id: u.data.area_id, empresa_id: u.data.empresa_id, changed } });
        }
      }
    }

    // ── joiners: provisiona cargo + create_if_not_exists (com pré-checagem no Entra) ──
    await progress({ phase: "joiners", message: `Provisionando ${inserted.length} novos…`, colab_percent: 65 });
    const activeJoiners = inserted.filter((i) => i.data.status === "ativo" && (i.data.sam_account_name || i.data.email));
    const entraExisting = await preCheckEntraExistence(activeJoiners.map((i) => ({ email: i.data.email, sam: i.data.sam_account_name })));
    for (const ins of inserted) {
      await sb.from("eventos_jml").insert({ tipo: "joiner", status: "executado", colaborador_id: ins.id, colaborador_nome: ins.data.nome, origem: "importacao_csv", dados_depois: { matricula: ins.data.matricula, status: ins.data.status } });
      if (ins.data.status !== "ativo") continue; // histórico/desligado importado: não cria conta
      const found = (ins.data.email && entraExisting.get(ins.data.email.toLowerCase())) || (ins.data.sam_account_name && entraExisting.get(`sam:${ins.data.sam_account_name.toLowerCase()}`));
      if (found) await sb.from("colaboradores").update({ entra_id: found }).eq("id", ins.id).is("entra_id", null);
      else if (ins.data.sam_account_name) {
        const parts = (ins.data.nome || "").split(" ");
        await sb.from("iam_queue").insert({
          action_type: "create_if_not_exists", colaborador_id: ins.id, target_identity: ins.data.sam_account_name, requested_by: requestedBy, status: "pending",
          resource_key: `ad_account:${ins.data.sam_account_name}`,
          payload_json: {
            givenName: parts[0] || "", surname: parts.slice(1).join(" ") || parts[0] || "", displayName: ins.data.nome,
            samAccountName: ins.data.sam_account_name, userPrincipalName: `${ins.data.sam_account_name}@${upnDomain}`, mail: ins.data.email,
            department: ins.data.area_id ? names.area.get(ins.data.area_id) || null : null, title: ins.data.cargo_id ? names.cargo.get(ins.data.cargo_id) || null : null,
            company: ins.data.empresa_id ? names.empresa.get(ins.data.empresa_id) || null : null, telephoneNumber: null, manager: null, ouPath: "",
          },
        }).then(({ error: e }: any) => { if (e && !/duplicate key/i.test(e.message)) console.warn(`[csv-sync] create_if_not_exists: ${e.message}`); });
      }
      if (ins.data.cargo_id) {
        const { error } = await sb.rpc("jml_alterar_cargo", { p_colaborador_id: ins.id, p_novo_cargo_id: ins.data.cargo_id, p_operador: operador, p_origem: "importacao_csv", p_cargo_anterior_id: null, p_atualizar_colaborador: false });
        if (error) console.warn(`[csv-sync] provisionar cargo ${ins.id}: ${error.message}`);
      }
    }

    // ── leavers (ausentes no CSV) ──
    let removed = 0;
    if (leaverGuardTriggered) {
      await progress({ phase: "leaver_guard", message: `LIMITE DE SEGURANÇA: ${leavers.length} ausentes (> ${leaverAbs} ou > ${leaverPct}% de ${activeBase}). Desligamentos NÃO aplicados.`, colab_percent: 85 });
      for (const e of leavers) quarantine.push({ matricula: e.matricula, nome: e.nome, email: e.email, motivo: "ausente_no_csv", detalhe: "Limite de segurança de desligamentos acionado — revisar manualmente", dados: null, colaborador_id: e.id });
      await sb.from("alertas").insert({
        titulo: "Importação RH: limite de desligamentos acionado", severidade: "critico", tipo: "csv_leaver_guard", ref_tipo: "sync_job", ref_id: jobId, ref_url: "/configuracoes/integracoes",
        mensagem: `${leavers.length} colaborador(es) ausentes no arquivo ${opts.filename} (limite: ${leaverAbs} ou ${leaverPct}% de ${activeBase} ativos). Nenhum desligamento foi aplicado; verifique se o CSV está completo. Os ausentes estão em quarentena.`,
      });
    } else if (leavers.length > 0) {
      await progress({ phase: "leavers", message: `Desligando ${leavers.length} ausentes…`, colab_percent: 85 });
      for (const e of leavers) {
        const { data: r, error } = await sb.rpc("jml_alterar_status", { p_colaborador_id: e.id, p_novo_status: "desligado", p_operador: operador, p_origem: "importacao_csv", p_motivo: `Ausente no CSV do RH (${opts.filename})` });
        if (error) { console.warn(`[csv-sync] leaver ${e.id}: ${error.message}`); continue; }
        if (r && r.ok === false) { quarantine.push({ matricula: e.matricula, nome: e.nome, email: e.email, motivo: "leaver_bloqueado", detalhe: String(r.error), dados: null, colaborador_id: e.id }); continue; }
        removed++;
        await sb.from("colaboradores").update({ ultima_importacao_id: jobId }).eq("id", e.id);
      }
      await sb.from("alertas").insert({ tipo: "remocao_csv", titulo: `${removed} colaborador(es) desligado(s) pelo RH`, mensagem: `Importação ${opts.filename}: ${removed} colaborador(es) ausentes do arquivo foram desligados (contas desabilitadas e acessos enfileirados para remoção).`, severidade: "info", ref_tipo: "sync_job", ref_id: jobId });
    }

    // ── inalterados ──
    for (const b of chunk(unchangedIds, 500)) await sb.from("colaboradores").update({ ultima_importacao_id: jobId }).in("id", b);

    // ── quarentena ──
    if (quarantine.length > 0) {
      for (const b of chunk(quarantine.map((q) => ({ import_job_id: jobId, colaborador_id: q.colaborador_id ?? null, matricula: q.matricula, nome: q.nome, email: q.email, motivo: q.motivo, detalhe: q.detalhe, dados: q.dados, status: "pendente" })), 200)) {
        const { error } = await sb.from("colab_quarentena").insert(b);
        if (error) console.warn(`[csv-sync] quarentena: ${error.message}`);
      }
    }

    const summary = `Concluído (${opts.source}): ${inserted.length} novos, ${updated} atualizados (${rehired} recontratados, ${linkedManual} vinculados a manuais), ${unchangedIds.length} inalterados, ${removed} desligados${leaverGuardTriggered ? ` — LIMITE DE SEGURANÇA acionado (${leavers.length} ausentes não aplicados)` : ""}, ${leaverSkippedOverride} preservados por exceção, ${quarantine.length} em quarentena.`;
    await progress({ status: "done", phase: "done", colab_percent: 100, colab_created: inserted.length, colab_updated: updated, colab_inativos: removed, colab_quarentena: quarantine.length, message: summary });
    await sb.from("auditoria").insert({ entidade: "importacao_csv", acao: "importar", operador, resumo: summary, detalhes: { filename: opts.filename, source: opts.source, jobId, rawTotal, total: rows.length, created: inserted.length, updated, rehired, linkedManual, unchanged: unchangedIds.length, removed, leavers: leavers.length, leaverGuardTriggered, quarantine: quarantine.length, weakProtected } });

    return { success: true, jobId, created: inserted.length, updated, unchanged: unchangedIds.length, removed, quarantined: quarantine.length, rehired, linkedManual, leaverGuardTriggered, dryRun: false, total: rows.length, rawTotal };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[csv-sync] error:", msg);
    await sb.from("sync_jobs").update({ status: "error", error: msg, message: `Erro: ${msg}`, updated_at: new Date().toISOString() }).eq("id", jobId);
    throw err;
  }
}
