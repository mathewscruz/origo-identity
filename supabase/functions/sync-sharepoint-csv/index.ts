import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── CSV Parsing (same logic as sync-csv-colab, inlined because Edge Functions can't share code) ──

interface CsvRow { [key: string]: string; }

const REQUIRED_HEADERS = ["displayName","employID","mail","company","title","status","Data_Admissao","Cadastro_Pessoa_Fisica","Base_Local"];

const STATUS_MAP: Record<string, string> = {
  ativo: "ativo", demitido: "desligado", desligado: "desligado", afastado: "afastado",
  "férias": "ferias", ferias: "ferias", inativo: "inativo", suspenso: "afastado",
  licenca: "afastado", "licença": "afastado", aposentado: "desligado", transferido: "ativo",
};

function normalizeHeader(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}

function findHeaderMatch(headers: string[], target: string): string | null {
  const normTarget = normalizeHeader(target);
  return headers.find(h => h === target) || headers.find(h => normalizeHeader(h) === normTarget) || headers.find(h => normalizeHeader(h).includes(normTarget)) || null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(headerLine: string): string {
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
}

function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem dados");
  const delimiter = detectDelimiter(lines[0]);
  console.log(`Detected delimiter: "${delimiter}"`);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  console.log(`Headers (${rawHeaders.length}): ${rawHeaders.slice(0, 10).join(", ")}`);

  const headerMap: Record<string, string> = {};
  const missing: string[] = [];
  for (const req of REQUIRED_HEADERS) {
    const match = findHeaderMatch(rawHeaders, req);
    if (match) headerMap[req] = match; else missing.push(req);
  }
  if (missing.length > 0) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);

  const reverseMap: Record<string, string> = {};
  for (const [std, actual] of Object.entries(headerMap)) reverseMap[actual] = std;

  const rows: CsvRow[] = [];
  let syntheticCount = 0;
  const matCount = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < rawHeaders.length * 0.5) continue;
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { row[h] = values[idx] || ""; if (reverseMap[h]) row[reverseMap[h]] = values[idx] || ""; });
    if (!(row["employID"] || "").trim()) {
      const key = [row["displayName"] || "", row["mail"] || "", row["Cadastro_Pessoa_Fisica"] || ""].join("|");
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      let hash = 0;
      for (const b of data) { hash = ((hash << 5) - hash + b) | 0; }
      const shortHash = Math.abs(hash).toString(36).padStart(6, "0").slice(0, 8);
      row["employID"] = `SEM_MAT_${shortHash}`;
      row["__synthetic_matricula"] = "true";
      syntheticCount++;
    }

    const baseMat = row["employID"].trim();
    const count = matCount.get(baseMat) || 0;
    matCount.set(baseMat, count + 1);
    if (count > 0) {
      row["employID"] = `${baseMat}_ROW_${count + 1}`;
    }

    rows.push(row);
  }
  console.log(`Parsed ${rows.length} rows (${syntheticCount} without original matricula)`);
  return rows;
}

function parseDate(d: string): string | null {
  if (!d || d === "NULL") return null;
  const parts = d.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const c: T[][] = [];
  for (let i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size));
  return c;
}

const PLACEHOLDER_EMPRESA_ID = "00000000-0000-0000-0000-000000000000";

function buildFingerprint(row: CsvRow): string {
  return [
    row.displayName || "",
    row.mail || "",
    (row.status || "ativo").toLowerCase(),
    row.company || "",
    (row.description || row.title || ""),
    row.departmentNumber || "",
    row.Base_Local || "",
    row.Cadastro_Pessoa_Fisica || "",
    row.Data_Admissao || "",
    row.Data_Rescisao || "",
  ].join("|").toLowerCase();
}

function buildNameLookup(cache: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [name, id] of cache) reverse.set(id, name);
  return reverse;
}

async function provisionCargoAcessosServer(
  sb: any, colaboradorId: string, newCargoId: string | null, oldCargoId: string | null,
  samAccountName: string, displayName: string, mail: string
) {
  if (oldCargoId) {
    const { data: activeAssignments } = await sb.from("perfil_atribuicoes").select("perfil_id")
      .eq("colaborador_id", colaboradorId).eq("origem", "cargo").eq("ativo", true);
    if (activeAssignments && activeAssignments.length > 0 && samAccountName) {
      for (const a of activeAssignments) await queueProfileAccess(sb, samAccountName, displayName, mail, a.perfil_id, "remove");
    }
    await sb.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId).eq("origem", "cargo").eq("ativo", true);
  }
  if (newCargoId) {
    const { data: cargoPerfis } = await sb.from("cargo_perfis").select("perfil_id").eq("cargo_id", newCargoId);
    if (cargoPerfis && cargoPerfis.length > 0) {
      await sb.from("perfil_atribuicoes").insert(cargoPerfis.map((cp: any) => ({
        perfil_id: cp.perfil_id, colaborador_id: colaboradorId, origem: "cargo", ativo: true,
      })));
      if (samAccountName) {
        for (const cp of cargoPerfis) await queueProfileAccess(sb, samAccountName, displayName, mail, cp.perfil_id, "add");
      }
    }
  }
}

async function queueProfileAccess(sb: any, samAccountName: string, displayName: string, mail: string, perfilId: string, action: "add" | "remove") {
  const { data: grupos } = await sb.from("perfil_grupos").select("grupo_id, entra_grupos(entra_id, nome)").eq("perfil_id", perfilId);
  if (grupos) {
    for (const g of grupos) {
      if (!g.entra_grupos) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_group" : "remove_group",
        payload_json: { samAccountName, displayName, mail, groupId: g.entra_grupos.entra_id, groupName: g.entra_grupos.nome, action },
        target_identity: samAccountName, requested_by: "importacao_sharepoint", status: "pending",
      });
    }
  }
  const { data: licencas } = await sb.from("perfil_licencas").select("licenca_id, entra_licencas(sku_id, nome)").eq("perfil_id", perfilId);
  if (licencas) {
    for (const l of licencas) {
      if (!l.entra_licencas) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_license" : "remove_license",
        payload_json: { samAccountName, displayName, mail, skuId: l.entra_licencas.sku_id, licenseName: l.entra_licencas.nome, action },
        target_identity: samAccountName, requested_by: "importacao_sharepoint", status: "pending",
      });
    }
  }
  // Apps with entra_id
  const { data: apps } = await sb.from("perfil_aplicacoes").select("aplicacao_id, aplicacoes(entra_id, nome, default_app_role_id)").eq("perfil_id", perfilId);
  if (apps) {
    for (const a of apps) {
      if (!a.aplicacoes || !a.aplicacoes.entra_id) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_app" : "remove_app",
        payload_json: {
          samAccountName, displayName, mail,
          appId: a.aplicacoes.entra_id, appName: a.aplicacoes.nome,
          appRoleId: a.aplicacoes.default_app_role_id || "00000000-0000-0000-0000-000000000000",
          action,
        },
        target_identity: samAccountName, requested_by: "importacao_sharepoint", status: "pending",
      });
    }
  }
}

// ── Canonical dedupe (CPF → email → sam → matricula) ──
const ACTIVE_STATUS_SET = new Set([
  "ativo", "ferias", "afastado",
  "afast aux doenca", "afast aux maternidade",
  "atestado medico", "licenca maternidade",
]);
function normStatus(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
function isActiveStatus(s: string): boolean {
  return ACTIVE_STATUS_SET.has(normStatus(s));
}
function dedupeKey(row: CsvRow): string {
  const cpf = (row.Cadastro_Pessoa_Fisica || "").replace(/\D/g, "").trim();
  if (cpf) return `cpf:${cpf}`;
  const mail = (row.mail || "").toLowerCase().trim();
  if (mail) return `mail:${mail}`;
  const sam = mail.includes("@") ? mail.split("@")[0] : "";
  if (sam) return `sam:${sam}`;
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
function dedupeRows(rows: CsvRow[]): {
  canonical: CsvRow[];
  removedMatriculas: Set<string>;
  duplicateGroups: number;
  removedRows: number;
  samples: Array<{ key: string; kept: string; removed: string[] }>;
} {
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const k = dedupeKey(r);
    const arr = groups.get(k) || [];
    arr.push(r); groups.set(k, arr);
  }
  const canonical: CsvRow[] = [];
  const removedMatriculas = new Set<string>();
  const samples: Array<{ key: string; kept: string; removed: string[] }> = [];
  let duplicateGroups = 0, removedRows = 0;
  for (const [k, arr] of groups) {
    if (arr.length === 1) { canonical.push(arr[0]); continue; }
    duplicateGroups++;
    let keep = arr[0];
    for (let i = 1; i < arr.length; i++) keep = pickCanonical(keep, arr[i]);
    const removedMats: string[] = [];
    for (const r of arr) {
      if (r === keep) continue;
      const m = (r.employID || "").trim();
      if (m) removedMatriculas.add(m);
      removedMats.push(m); removedRows++;
    }
    canonical.push(keep);
    if (samples.length < 20) samples.push({ key: k, kept: (keep.employID || "").trim(), removed: removedMats });
  }
  return { canonical, removedMatriculas, duplicateGroups, removedRows, samples };
}

// ── Weak identity protection ──
// If a historical/inactive row shares mail / mail local-part / derived SAM
// with an ACTIVE RH row of a DIFFERENT CPF, the active row owns the AD/Entra
// identity. The historical row is imported without operational mail/SAM so it
// cannot match on AD/Entra in future syncs.
function normalizeCpf(v: string): string {
  return (v || "").replace(/\D/g, "").trim();
}
function normalizeMail(v: string): string {
  return (v || "").toLowerCase().trim();
}
function deriveSam(row: CsvRow): string {
  const mail = normalizeMail(row.mail);
  if (mail.includes("@")) return mail.split("@")[0];
  return (row.employID || "").trim().toLowerCase();
}
function localPart(mail: string): string {
  return mail.includes("@") ? mail.split("@")[0] : "";
}
function applyWeakIdentityProtection(rows: CsvRow[]): {
  protectedRows: number;
  samples: Array<{ matricula: string; cpf: string; mail: string; sam: string; conflictWith: string; via: string }>;
} {
  // Build ownership index from ACTIVE rows: identity → cpf
  const mailOwner = new Map<string, string>();      // mail → cpf
  const localOwner = new Map<string, string>();     // local-part → cpf
  const samOwner = new Map<string, string>();       // sam → cpf
  for (const r of rows) {
    if (!isActiveStatus(r.status)) continue;
    const cpf = normalizeCpf(r.Cadastro_Pessoa_Fisica);
    if (!cpf) continue;
    const mail = normalizeMail(r.mail);
    if (mail) {
      if (!mailOwner.has(mail)) mailOwner.set(mail, cpf);
      const lp = localPart(mail);
      if (lp && !localOwner.has(lp)) localOwner.set(lp, cpf);
    }
    const sam = deriveSam(r);
    if (sam && !samOwner.has(sam)) samOwner.set(sam, cpf);
  }

  let protectedRows = 0;
  const samples: Array<{ matricula: string; cpf: string; mail: string; sam: string; conflictWith: string; via: string }> = [];
  for (const r of rows) {
    if (isActiveStatus(r.status)) continue;
    const cpf = normalizeCpf(r.Cadastro_Pessoa_Fisica);
    const mail = normalizeMail(r.mail);
    const lp = localPart(mail);
    const sam = deriveSam(r);

    let conflict: string | null = null;
    let via = "";
    if (mail && mailOwner.has(mail) && mailOwner.get(mail) !== cpf) { conflict = mailOwner.get(mail)!; via = "mail"; }
    else if (lp && localOwner.has(lp) && localOwner.get(lp) !== cpf) { conflict = localOwner.get(lp)!; via = "local_part"; }
    else if (sam && samOwner.has(sam) && samOwner.get(sam) !== cpf) { conflict = samOwner.get(sam)!; via = "sam"; }

    if (conflict) {
      if (samples.length < 20) {
        samples.push({ matricula: (r.employID || "").trim(), cpf, mail, sam, conflictWith: conflict, via });
      }
      r["__weak_identity_protected"] = "true";
      // Strip operational identity so it won't match AD/Entra
      r["mail"] = "";
      protectedRows++;
    }
  }
  return { protectedRows, samples };
}

// ── Incremental sync processing logic ──
async function processCsvData(sb: any, csvText: string, filename: string) {
  const { data: job, error: jobErr } = await sb.from("sync_jobs")
    .insert({ status: "running", tipo: "csv_colab", message: "Iniciando importação CSV (SharePoint)...", phase: "parsing", filename })
    .select().single();
  if (jobErr) throw jobErr;
  const jobId = job.id;

  try {
    const rawRows = parseCsv(csvText);
    const rawTotalRows = rawRows.length;
    const dedupe = dedupeRows(rawRows);
    const rows = dedupe.canonical;
    const totalRows = rows.length;
    console.log(`[dedupe] raw=${rawTotalRows} canonical=${totalRows} groups=${dedupe.duplicateGroups} removed=${dedupe.removedRows}`);
    const weakProtection = applyWeakIdentityProtection(rows);
    if (weakProtection.protectedRows > 0) {
      console.log(`[weak-identity] protected_rows=${weakProtection.protectedRows} samples=${JSON.stringify(weakProtection.samples)}`);
    }
    await sb.from("sync_jobs").update({
      message: `Parsed ${rawTotalRows} bruto → ${totalRows} canônico (${dedupe.removedRows} duplicados removidos). Comparando...`,
      phase: "comparing", colab_total: totalRows,
    }).eq("id", jobId);

    // ── Load existing CSV-origin records ──
    const existingMap = new Map<string, { id: string; fingerprint: string; cargo_id: string | null; sam_account_name: string | null; status: string }>();
    let from = 0;
    while (true) {
      const { data } = await sb.from("colaboradores").select("id, matricula, import_hash, cargo_id, sam_account_name, status").eq("origem", "csv").range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => {
        if (c.matricula) existingMap.set(c.matricula, { id: c.id, fingerprint: c.import_hash || "", cargo_id: c.cargo_id, sam_account_name: c.sam_account_name, status: c.status });
      });
      if (data.length < 1000) break;
      from += 1000;
    }
    console.log(`Existing CSV colaboradores: ${existingMap.size}`);

    // ── Resolve lookup entities ──
    await sb.from("sync_jobs").update({ phase: "lookups", message: "Resolvendo entidades...", colab_percent: 10 }).eq("id", jobId);

    const empresaCache = new Map<string, string>();
    const cargoCache = new Map<string, string>();
    const areaCache = new Map<string, string>();
    const localCache = new Map<string, string>();

    const [empresas, cargosData, areasData, locaisData] = await Promise.all([
      sb.from("empresas").select("id, nome"), sb.from("cargos").select("id, nome"),
      sb.from("areas").select("id, nome"), sb.from("localidades").select("id, nome"),
    ]);
    (empresas.data || []).forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    (cargosData.data || []).forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    (areasData.data || []).forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    (locaisData.data || []).forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));

    const missingEmpresas = new Set<string>(), missingCargos = new Set<string>(), missingAreas = new Set<string>(), missingLocais = new Set<string>();

    for (const row of rows) {
      const company = row.company?.trim();
      if (company && company !== "NULL" && !empresaCache.has(company.toLowerCase())) missingEmpresas.add(company);
      const cargo = (row.description || row.title || "").trim();
      if (cargo && cargo !== "NULL" && !cargoCache.has(cargo.toLowerCase())) missingCargos.add(cargo);
      const area = row.departmentNumber?.trim();
      if (area && area !== "NULL" && !areaCache.has(area.toLowerCase())) missingAreas.add(area);
      const local = row.Base_Local?.trim();
      if (local && local !== "NULL" && !localCache.has(local.toLowerCase())) missingLocais.add(local);
    }

    if (missingEmpresas.size > 0) {
      for (const b of chunk(Array.from(missingEmpresas).map(nome => ({ nome })), 200))
        await sb.from("empresas").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      const { data } = await sb.from("empresas").select("id, nome");
      if (data) data.forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    }
    if (missingCargos.size > 0) {
      for (const b of chunk(Array.from(missingCargos).map(nome => ({ nome })), 200))
        await sb.from("cargos").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      const { data } = await sb.from("cargos").select("id, nome");
      if (data) data.forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    }
    if (missingAreas.size > 0) {
      for (const b of chunk(Array.from(missingAreas).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200))
        await sb.from("areas").insert(b);
      const { data } = await sb.from("areas").select("id, nome");
      if (data) data.forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    }
    if (missingLocais.size > 0) {
      for (const b of chunk(Array.from(missingLocais).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200))
        await sb.from("localidades").insert(b);
      const { data } = await sb.from("localidades").select("id, nome");
      if (data) data.forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));
    }

    // Build reverse lookups (id -> name)
    const empresaNames = buildNameLookup(empresaCache);
    const cargoNames = buildNameLookup(cargoCache);
    const areaNames = buildNameLookup(areaCache);

    function buildColabData(row: CsvRow) {
      const statusMapped = STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo";
      const protectedRow = row["__weak_identity_protected"] === "true";
      const email = protectedRow ? "" : (row.mail || "");
      const samAccountName = protectedRow
        ? null
        : (email.includes("@") ? email.split("@")[0] : (row.employID || "").trim());
      return {
        nome: row.displayName, email: email || null, matricula: row.employID.trim(),
        cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: empresaCache.get((row.company || "").toLowerCase()) || null,
        cargo_id: cargoCache.get(((row.description || row.title || "").trim()).toLowerCase()) || null,
        area_id: areaCache.get((row.departmentNumber || "").toLowerCase()) || null,
        localidade_id: localCache.get((row.Base_Local || "").toLowerCase()) || null,
        status: statusMapped,
        data_admissao: parseDate(row.Data_Admissao), data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv", ultima_importacao_id: jobId,
        import_hash: buildFingerprint(row),
        sam_account_name: samAccountName,
      };
    }

    // ── Classify rows ──
    await sb.from("sync_jobs").update({ phase: "classifying", message: "Classificando mudanças...", colab_percent: 20 }).eq("id", jobId);

    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any; oldCargoId: string | null; oldStatus: string; oldSam: string | null }[] = [];
    const csvMatriculas = new Set<string>();
    let unchanged = 0;

    for (const row of rows) {
      const mat = row.employID.trim();
      csvMatriculas.add(mat);
      const fp = buildFingerprint(row);
      const existing = existingMap.get(mat);

      if (!existing) {
        toInsert.push(buildColabData(row));
      } else if (existing.fingerprint !== fp) {
        toUpdate.push({ id: existing.id, data: buildColabData(row), oldCargoId: existing.cargo_id, oldStatus: existing.status, oldSam: existing.sam_account_name });
      } else {
        unchanged++;
      }
    }

    const leaverIds: string[] = [];
    const leaverMatriculas: string[] = [];
    const leaverDetails: { id: string; sam: string | null; cargo_id: string | null; status: string; silentDisable: boolean }[] = [];
    const INACTIVE_DB_STATUSES = new Set(["desligado", "inativo"]);
    for (const [mat, rec] of existingMap) {
      if (!csvMatriculas.has(mat)) {
        const isDedupeRemoved = dedupe.removedMatriculas.has(mat);
        const silentDisable = isDedupeRemoved && INACTIVE_DB_STATUSES.has((rec.status || "").toLowerCase());
        leaverIds.push(rec.id);
        leaverMatriculas.push(mat);
        leaverDetails.push({ id: rec.id, sam: rec.sam_account_name, cargo_id: rec.cargo_id, status: rec.status, silentDisable });
      }
    }
    const silentCount = leaverDetails.filter(l => l.silentDisable).length;
    if (silentCount > 0) console.log(`[dedupe] ${silentCount} leaver(s) já inativos serão removidos sem enfileirar disable`);

    console.log(`Classification: ${toInsert.length} new, ${toUpdate.length} changed, ${unchanged} unchanged, ${leaverIds.length} leavers`);

    // ── Execute INSERTs ──
    await sb.from("sync_jobs").update({ phase: "inserting", message: `Inserindo ${toInsert.length} novos...`, colab_percent: 30 }).eq("id", jobId);

    let created = 0;
    const insertedIds: { id: string; data: any }[] = [];
    if (toInsert.length > 0) {
      const insertChunks = chunk(toInsert, 500);
      for (let ci = 0; ci < insertChunks.length; ci++) {
        const { data: inserted, error: insErr } = await sb.from("colaboradores").insert(insertChunks[ci]).select("id");
        if (insErr) { console.error("Insert batch error:", insErr.message); continue; }
        if (inserted) {
          created += inserted.length;
          inserted.forEach((ins: any, idx: number) => {
            const dataIdx = ci * 500 + idx;
            if (dataIdx < toInsert.length) insertedIds.push({ id: ins.id, data: toInsert[dataIdx] });
          });
        }
        const pct = 30 + Math.round((ci + 1) / insertChunks.length * 20);
        await sb.from("sync_jobs").update({ colab_percent: pct, colab_created: created }).eq("id", jobId);
      }
    }

    // ── Execute UPDATEs ──
    let updated = 0;
    if (toUpdate.length > 0) {
      await sb.from("sync_jobs").update({ phase: "updating", message: `Atualizando ${toUpdate.length}...`, colab_percent: 55 }).eq("id", jobId);
      for (const item of toUpdate) {
        const { error } = await sb.from("colaboradores").update(item.data).eq("id", item.id);
        if (!error) updated++;
      }
    }

    // ── Handle leavers: disable in AD BEFORE deleting ──
    if (leaverIds.length > 0) {
      await sb.from("sync_jobs").update({ phase: "removing", message: `Removendo ${leaverIds.length} ausentes...`, colab_percent: 75 }).eq("id", jobId);

      // Generate iam_queue disable entries for leavers (skip dedupe-removed already-inactive)
      const leaverIamEntries = leaverDetails.filter(l => l.sam && !l.silentDisable).map(l => ({
        action_type: "disable",
        payload_json: {
          samAccountName: l.sam, displayName: "", mail: "",
          status: "disabled", status_anterior: "ativo", status_novo: "desligado",
          changed_fields: ["status"], new_values: { status: "disabled" },
        },
        target_identity: l.sam, colaborador_id: l.id,
        requested_by: "importacao_sharepoint", status: "pending",
      }));
      if (leaverIamEntries.length > 0) {
        for (const batch of chunk(leaverIamEntries, 200)) await sb.from("iam_queue").insert(batch);
      }

      // Revoke access profiles for leavers (skip dedupe-removed already-inactive)
      for (const l of leaverDetails) {
        if (l.silentDisable) continue;
        if (l.cargo_id && l.sam) await provisionCargoAcessosServer(sb, l.id, null, l.cargo_id, l.sam, "", "");
      }

      // Disable Entra ID accounts for leavers (skip dedupe-removed already-inactive)
      const leaverEntraEntries = leaverDetails.filter(l => l.sam && !l.silentDisable).map(l => ({
        action_type: "disable_entra",
        payload_json: { samAccountName: l.sam, displayName: "", mail: "" },
        target_identity: l.sam, colaborador_id: l.id,
        requested_by: "importacao_sharepoint", status: "pending",
      }));
      if (leaverEntraEntries.length > 0) {
        for (const batch of chunk(leaverEntraEntries, 200)) await sb.from("iam_queue").insert(batch);
      }

      for (const batch of chunk(leaverIds, 200)) {
        await sb.from("perfil_atribuicoes").delete().in("colaborador_id", batch);
        await sb.from("excecoes").delete().in("colaborador_id", batch);
        await sb.from("revisao_itens").delete().in("colaborador_id", batch);
        await sb.from("colaboradores").delete().in("id", batch);
      }
    }

    // ── Update unchanged records' import job ──
    if (unchanged > 0) {
      const unchangedIds: string[] = [];
      for (const row of rows) {
        const mat = row.employID.trim();
        const existing = existingMap.get(mat);
        if (existing && existing.fingerprint === buildFingerprint(row)) unchangedIds.push(existing.id);
      }
      for (const batch of chunk(unchangedIds, 500)) {
        await sb.from("colaboradores").update({ ultima_importacao_id: jobId }).in("id", batch);
      }
    }

    // ── Register JML events + iam_queue ──
    await sb.from("sync_jobs").update({ phase: "events", message: "Registrando eventos JML...", colab_percent: 85 }).eq("id", jobId);

    if (leaverMatriculas.length > 0) {
      const leaverEvents = leaverMatriculas.map(mat => ({
        tipo: "leaver", colaborador_nome: mat, status: "pendente", origem: "importacao_csv", dados_antes: { matricula: mat },
      }));
      for (const b of chunk(leaverEvents, 200)) await sb.from("eventos_jml").insert(b);
    }
    if (toInsert.length > 0) {
      const joinerEvents = toInsert.map(c => ({
        tipo: "joiner", colaborador_nome: c.nome || c.matricula, status: "pendente", origem: "importacao_csv", dados_depois: { matricula: c.matricula },
      }));
      for (const b of chunk(joinerEvents, 200)) await sb.from("eventos_jml").insert(b);

      // iam_queue: create_if_not_exists with enriched payload
      const iamEntries = toInsert.filter(c => c.sam_account_name).map(c => {
        const nameParts = (c.nome || "").split(" ");
        const givenName = nameParts[0] || "";
        const surname = nameParts.slice(1).join(" ") || givenName;
        return {
          action_type: "create_if_not_exists",
          payload_json: {
            givenName, surname, displayName: c.nome,
            samAccountName: c.sam_account_name,
            userPrincipalName: `${c.sam_account_name}@ebessolar.local`,
            mail: c.email,
            department: c.area_id ? (areaNames.get(c.area_id) || null) : null,
            title: c.cargo_id ? (cargoNames.get(c.cargo_id) || null) : null,
            company: c.empresa_id ? (empresaNames.get(c.empresa_id) || null) : null,
            telephoneNumber: null, manager: null, ouPath: "",
          },
          target_identity: c.sam_account_name,
          requested_by: "importacao_sharepoint", status: "pending",
        };
      });
      for (const b of chunk(iamEntries, 200)) await sb.from("iam_queue").insert(b);

      // Provision access profiles for joiners
      for (const ins of insertedIds) {
        if (ins.data.cargo_id && ins.data.sam_account_name) {
          await provisionCargoAcessosServer(sb, ins.id, ins.data.cargo_id, null, ins.data.sam_account_name, ins.data.nome || "", ins.data.email || "");
        }
      }
    }
    if (toUpdate.length > 0) {
      const moverEvents = toUpdate.map(u => ({
        tipo: "mover", colaborador_nome: u.data.nome || u.data.matricula, colaborador_id: u.id, status: "pendente", origem: "importacao_csv", dados_depois: { matricula: u.data.matricula },
      }));
      for (const b of chunk(moverEvents, 200)) await sb.from("eventos_jml").insert(b);

      // iam_queue for movers
      for (const item of toUpdate) {
        const sam = item.data.sam_account_name || item.oldSam;
        if (!sam) continue;

        const newStatus = item.data.status;
        const oldStatus = item.oldStatus;
        const isDisabling = (newStatus === "desligado" || newStatus === "inativo") && oldStatus !== newStatus;

        if (isDisabling) {
          await sb.from("iam_queue").insert({
            action_type: "disable",
            payload_json: {
              samAccountName: sam, mail: item.data.email || "", displayName: item.data.nome || "",
              status: "disabled", status_anterior: oldStatus, status_novo: newStatus,
              changed_fields: ["status"], new_values: { status: "disabled" },
            },
            target_identity: sam, colaborador_id: item.id,
            requested_by: "importacao_sharepoint", status: "pending",
          });
          if (item.oldCargoId) {
            await provisionCargoAcessosServer(sb, item.id, null, item.oldCargoId, sam, item.data.nome || "", item.data.email || "");
          }
          // Also remove non-cargo profile resources
          const { data: otherAtribuicoes } = await sb.from("perfil_atribuicoes")
            .select("perfil_id")
            .eq("colaborador_id", item.id)
            .eq("ativo", true)
            .neq("origem", "cargo");
          if (otherAtribuicoes && otherAtribuicoes.length > 0) {
            for (const a of otherAtribuicoes) {
              await queueProfileAccess(sb, sam, item.data.nome || "", item.data.email || "", a.perfil_id, "remove");
            }
          }
          // Disable Entra ID account
          await sb.from("iam_queue").insert({
            action_type: "disable_entra",
            payload_json: { mail: item.data.email || "", samAccountName: sam, displayName: item.data.nome || "" },
            target_identity: sam, colaborador_id: item.id,
            requested_by: "importacao_sharepoint", status: "pending",
          });
        } else {
          const changedFields: string[] = [];
          const newValues: Record<string, string | null> = {};
          if (item.data.cargo_id !== item.oldCargoId) {
            changedFields.push("title");
            newValues.title = item.data.cargo_id ? (cargoNames.get(item.data.cargo_id) || null) : null;
          }
          if (item.data.area_id) { changedFields.push("department"); newValues.department = areaNames.get(item.data.area_id) || null; }
          if (item.data.empresa_id) { changedFields.push("company"); newValues.company = empresaNames.get(item.data.empresa_id) || null; }

          if (changedFields.length > 0) {
            await sb.from("iam_queue").insert({
              action_type: "update",
              payload_json: {
                samAccountName: sam, mail: item.data.email || "", displayName: item.data.nome || "",
                status: "enabled", changed_fields: changedFields, new_values: newValues,
              },
              target_identity: sam, colaborador_id: item.id,
              requested_by: "importacao_sharepoint", status: "pending",
            });
          }

          if (item.data.cargo_id !== item.oldCargoId) {
            await provisionCargoAcessosServer(sb, item.id, item.data.cargo_id, item.oldCargoId, sam, item.data.nome || "", item.data.email || "");
          }
        }
      }
    }

    if (leaverMatriculas.length > 0) {
      await sb.from("alertas").insert({
        tipo: "remocao_csv", titulo: `${leaverMatriculas.length} colaborador(es) removido(s)`,
        mensagem: `Importação CSV removeu ${leaverMatriculas.length} colaborador(es) ausentes do arquivo.`,
        severidade: "info", ref_tipo: "sync_job", ref_id: jobId,
      });
    }

    // ── Finalize ──
    await sb.from("sync_jobs").update({
      status: "done", phase: "done", colab_percent: 100,
      colab_created: created, colab_updated: updated, colab_quarentena: leaverMatriculas.length,
      message: `Concluído: bruto=${rawTotalRows}, canônico=${totalRows}, dedupe=${dedupe.removedRows} (grupos=${dedupe.duplicateGroups}), ${created} novos, ${updated} atualizados, ${unchanged} inalterados, ${leaverMatriculas.length} removidos (${silentCount} silenciosos), ${weakProtection.protectedRows} protegidos (identidade fraca)`,
    }).eq("id", jobId);

    await sb.from("auditoria").insert({
      entidade: "importacao_csv", acao: "importar",
      resumo: `CSV SharePoint: bruto=${rawTotalRows} → canônico=${totalRows} · ${created} novos, ${updated} atualizados, ${leaverMatriculas.length} removidos · ${weakProtection.protectedRows} protegidos`,
      detalhes: {
        filename, jobId,
        rawTotalRows, totalRows,
        duplicate_groups: dedupe.duplicateGroups,
        removed_rows: dedupe.removedRows,
        samples: dedupe.samples,
        silent_disable_count: silentCount,
        weak_identity_protection: {
          protected_rows: weakProtection.protectedRows,
          samples: weakProtection.samples,
        },
        created, updated, unchanged, removed: leaverMatriculas.length,
      },
    });

    return {
      success: true, jobId, file: filename,
      rawTotalRows, totalRows,
      duplicate_groups: dedupe.duplicateGroups,
      removed_rows: dedupe.removedRows,
      samples: dedupe.samples,
      weak_identity_protection: {
        protected_rows: weakProtection.protectedRows,
        samples: weakProtection.samples,
      },
      created, updated, unchanged, removed: leaverMatriculas.length, total: totalRows,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Processing error:", msg);
    await sb.from("sync_jobs").update({ status: "error", error: msg, message: `Erro: ${msg}` }).eq("id", jobId);
    throw err;
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Azure credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    console.log("Authenticating with Azure AD...");
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    if (!tokenRes.ok) throw new Error(`Azure auth failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();
    console.log("Azure AD token acquired");

    const graphHeaders = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

    console.log("Resolving SharePoint site...");
    const siteRes = await fetch("https://graph.microsoft.com/v1.0/sites/origoenergia.sharepoint.com:/sites/dataanalytics", { headers: graphHeaders });
    if (!siteRes.ok) throw new Error(`Site resolution failed: ${siteRes.status}`);
    const site = await siteRes.json();
    const siteId = site.id;
    console.log(`Site resolved: ${siteId}`);

    console.log("Listing files in RH_COLAB...");
    const filesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/RH_COLAB:/children?$orderby=lastModifiedDateTime desc&$top=200`, { headers: graphHeaders });
    if (!filesRes.ok) throw new Error(`Folder listing failed: ${filesRes.status}`);
    const filesData = await filesRes.json();
    const csvFiles = (filesData.value || [])
      .filter((f: any) => f.name?.toLowerCase().startsWith("base_colab_") && f.name?.toLowerCase().endsWith(".csv"))
      .sort((a: any, b: any) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());

    if (csvFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No CSV files found with prefix base_colab_" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latestFile = csvFiles[0];
    console.log(`Latest CSV: ${latestFile.name} (modified: ${latestFile.lastModifiedDateTime})`);

    const downloadUrl = latestFile["@microsoft.graph.downloadUrl"];
    let csvBytes: Uint8Array;
    if (downloadUrl) {
      const dlRes = await fetch(downloadUrl);
      if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
      csvBytes = new Uint8Array(await dlRes.arrayBuffer());
    } else {
      const dlRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${latestFile.id}/content`, { headers: graphHeaders });
      if (!dlRes.ok) throw new Error(`Download via content failed: ${dlRes.status}`);
      csvBytes = new Uint8Array(await dlRes.arrayBuffer());
    }
    console.log(`Downloaded ${csvBytes.length} bytes`);

    const csvText = new TextDecoder("utf-8").decode(csvBytes);
    const result = await processCsvData(sb, csvText, latestFile.name);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
